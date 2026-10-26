-- ============================================================
-- CODE ARTICLE généré automatiquement — même principe que la
-- numérotation des commandes (commandes.numero, "CMD-0001"), mais
-- attribué côté base de données (trigger SECURITY DEFINER), jamais par le
-- client : la numérotation des commandes, elle, reste calculée côté
-- client (business.next_numero lu puis incrémenté par deux appels
-- séparés, voir app/(app)/nouvelle/page.js) et n'offre donc aucune
-- garantie d'atomicité en cas de création quasi simultanée depuis deux
-- appareils/onglets -- un défaut assumé jusqu'ici pour les commandes,
-- mais explicitement à éviter ici pour le code article.
--
-- Format : ART-0001, ART-0002... — numérotation propre à chaque
-- boutique (chaque boutique repart de ART-0001), jamais réattribué même
-- après suppression d'un article (le compteur ne décroît jamais).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Rejouable sans risque
-- (toutes les étapes utilisent IF NOT EXISTS / IF NULL / CREATE OR
-- REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- Colonne nullable dans un premier temps : la contrainte NOT NULL n'est
-- posée qu'après le backfill plus bas, une fois que chaque article
-- existant a effectivement reçu un code.
alter table articles add column if not exists code text;

-- Compteur par boutique, même rôle que businesses.next_numero pour les
-- commandes -- mais JAMAIS accordé en écriture au client (voir le
-- GRANT UPDATE de supabase-businesses-colonnes-restreintes-migration.sql,
-- qui liste explicitement les colonnes autorisées pour `authenticated` :
-- next_code_article n'y figure pas, et ne doit jamais y figurer). Seule
-- la fonction SECURITY DEFINER plus bas, qui s'exécute avec les
-- privilèges du propriétaire de la fonction et non ceux de l'appelant,
-- peut l'incrémenter -- exactement la faille que cette migration-là avait
-- corrigée (un commerçant ne doit jamais pouvoir écrire un compteur
-- interne directement via l'API REST).
alter table businesses add column if not exists next_code_article integer not null default 1;

-- ------------------------------------------------------------
-- Backfill : attribue un code à tous les articles déjà existants,
-- boutique par boutique, dans l'ordre de création (le plus ancien reçoit
-- ART-0001). Reprend après le plus grand code déjà attribué à cette
-- boutique (jamais 1 à nouveau) : rejouable sans écraser un code déjà
-- posé, y compris par un trigger entre-temps -- seules les lignes dont
-- code est encore NULL sont concernées, et une exécution ultérieure ne
-- trouve donc plus rien à faire (CTE vide, UPDATE sans effet).
--
-- Exécuté AVANT la création des triggers plus bas, en particulier celui
-- qui verrouille `code` contre toute modification après coup (UPDATE) :
-- s'il existait déjà à ce moment, il annulerait silencieusement cette
-- toute première attribution (new.code := old.code, soit NULL -> NULL).
-- ------------------------------------------------------------
with max_par_boutique as (
  select business_id, coalesce(max(substring(code from 5)::integer), 0) as max_numero
  from articles
  where code is not null
  group by business_id
),
a_numeroter as (
  select
    a.id,
    row_number() over (partition by a.business_id order by a.created_at asc, a.id asc) as rang,
    coalesce(m.max_numero, 0) as base
  from articles a
  left join max_par_boutique m on m.business_id = a.business_id
  where a.code is null
)
update articles a
set code = 'ART-' || lpad((an.base + an.rang)::text, 4, '0')
from a_numeroter an
where a.id = an.id;

-- Tous les articles ont désormais un code (backfill ci-dessus + tout
-- nouvel article passe par le trigger plus bas) : NOT NULL garanti.
alter table articles alter column code set not null;

-- Contrainte d'unicité demandée explicitement (par boutique, jamais deux
-- articles d'une même boutique avec le même code -- deux boutiques
-- différentes peuvent, elles, avoir chacune un ART-0001).
alter table articles drop constraint if exists articles_business_code_unique;
alter table articles add constraint articles_business_code_unique unique (business_id, code);

-- Recalculé à partir de l'état réel de articles.code (jamais incrémenté
-- "à l'aveugle") : sûr à rejouer à tout moment, y compris après que de
-- nouveaux articles ont déjà été créés via le trigger -- max(code) + 1
-- reste alors exactement égal au compteur déjà en place, cette étape ne
-- fait que reconfirmer l'invariant plutôt que le perturber.
update businesses b
set next_code_article = coalesce((
  select max(substring(a.code from 5)::integer)
  from articles a
  where a.business_id = b.id
), 0) + 1;

-- ------------------------------------------------------------
-- gerer_code_article() : une seule fonction pour les deux triggers
-- ci-dessous.
--   - INSERT : ignore toute valeur de `code` envoyée par le client (même
--     par un appel direct à l'API REST en dehors de cette app) et
--     attribue toujours le prochain numéro de la boutique, en
--     incrémentant son compteur de façon atomique -- `update ... where
--     id = new.business_id` verrouille la ligne businesses concernée
--     jusqu'à la fin de la transaction, donc deux créations quasi
--     simultanées pour la même boutique sérialisent naturellement sur ce
--     verrou et reçoivent toujours deux numéros distincts, jamais le
--     même (contrairement à next_numero des commandes, lu puis
--     réécrit en deux appels séparés côté client, sans aucun verrou).
--   - UPDATE : reverrouille systématiquement `code` sur sa valeur
--     d'origine, quoi que le client envoie -- jamais modifiable après
--     coup, par l'UI de cette app comme par un appel direct à l'API.
--   - DELETE : rien à faire ici -- le compteur next_code_article
--     n'est jamais décrémenté, donc un code supprimé n'est jamais
--     réattribué.
-- SECURITY DEFINER : seul moyen pour ce trigger d'écrire
-- businesses.next_code_article, colonne volontairement absente de tout
-- GRANT UPDATE accordé à authenticated (voir plus haut).
-- ------------------------------------------------------------
create or replace function gerer_code_article()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if tg_op = 'INSERT' then
    update businesses
      set next_code_article = next_code_article + 1
      where id = new.business_id
      returning next_code_article - 1 into v_numero;
    if not found then
      raise exception 'Boutique introuvable pour l''attribution du code article';
    end if;
    new.code := 'ART-' || lpad(v_numero::text, 4, '0');
  elsif tg_op = 'UPDATE' then
    new.code := old.code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_code_article_insert on articles;
create trigger trg_code_article_insert
  before insert on articles
  for each row
  execute function gerer_code_article();

drop trigger if exists trg_code_article_update on articles;
create trigger trg_code_article_update
  before update on articles
  for each row
  execute function gerer_code_article();

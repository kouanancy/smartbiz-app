-- ============================================================
-- PRIX DE VENTE — modifiable uniquement depuis la carte Article
-- À exécuter une fois dans l'éditeur SQL Supabase, après
-- supabase-achats-approvisionnement-migration.sql et
-- supabase-articles-actif-migration.sql.
-- ============================================================

-- Nullable désormais : un article créé depuis une réception n'a plus de
-- prix de vente renseigné à la création — null signifie « à définir »,
-- distinct d'un 0 qui resterait un prix explicite si jamais saisi ainsi
-- depuis la carte Article. Les articles existants gardent leur valeur
-- actuelle, jamais touchée par ce alter column (ni l'un ni l'autre
-- n'affecte les lignes déjà en base, seulement les futures).
alter table articles alter column prix_vente drop not null;
alter table articles alter column prix_vente drop default;

-- ------------------------------------------------------------
-- reception_lignes.prix_vente : conservée pour les lignes déjà
-- enregistrées (compatibilité, réceptions déjà validées inchangées),
-- mais plus aucune NOUVELLE ligne ne peut la renseigner — valider_
-- reception() plus bas ne la lit plus du tout pour créer un article.
-- Un simple check est impossible ici (des lignes historiques ont déjà
-- une valeur non nulle), d'où un trigger BEFORE INSERT, qui ne
-- s'applique qu'aux nouvelles lignes et laisse l'historique intact.
-- ------------------------------------------------------------
create or replace function verifier_reception_ligne_pas_de_prix_vente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prix_vente is not null then
    raise exception 'Le prix de vente ne se renseigne plus depuis une réception : utilisez la fiche de l''article.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifier_reception_ligne_pas_de_prix_vente on reception_lignes;
create trigger trg_verifier_reception_ligne_pas_de_prix_vente
  before insert on reception_lignes
  for each row
  execute function verifier_reception_ligne_pas_de_prix_vente();

-- ------------------------------------------------------------
-- Tant que le prix de vente d'un article n'est pas défini, il ne peut
-- pas être ajouté à une commande — même règle que pour un article
-- désactivé (supabase-articles-actif-migration.sql), trigger séparé et
-- indépendant plutôt que fondu dans celui-là : chacun ne vérifie qu'une
-- seule condition, les deux se posent côte à côte sur commande_lignes.
-- ------------------------------------------------------------
create or replace function verifier_article_prix_defini_commande()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prix_vente numeric;
begin
  select prix_vente into v_prix_vente from articles where id = new.article_id;
  if v_prix_vente is null then
    raise exception 'Cet article n''a pas encore de prix de vente défini : renseignez-le dans sa fiche avant de l''ajouter à une commande.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifier_article_prix_defini_commande on commande_lignes;
create trigger trg_verifier_article_prix_defini_commande
  before insert on commande_lignes
  for each row
  execute function verifier_article_prix_defini_commande();

-- ------------------------------------------------------------
-- valider_reception() : reprise à l'identique de la version de
-- supabase-achats-approvisionnement-migration.sql, à une seule
-- différence près — la création d'un nouvel article n'écrit plus de
-- prix_vente du tout (colonne retirée de la liste insérée, donc valeur
-- par défaut de la colonne : null, « à définir »). Tout le reste
-- (numérotation, coût moyen pondéré, frais groupés/au prorata...) est
-- inchangé.
-- ------------------------------------------------------------
create or replace function valider_reception(p_reception_id uuid)
returns receptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reception receptions;
  v_ligne record;
  v_article_id uuid;
  v_stock_actuel integer;
  v_prix_achat_actuel numeric;
  v_frais_annexes_actuel numeric;
  v_nouveau_prix_achat numeric;
  v_nouveaux_frais_annexes numeric;
  v_cout_revient numeric;
  v_total_achat numeric := 0;
  v_cumul_frais numeric := 0;
  v_part numeric;
  v_nb_lignes integer;
  v_rang integer := 0;
begin
  select * into v_reception from receptions where id = p_reception_id for update;
  if not found then
    raise exception 'Réception introuvable';
  end if;

  if not exists (select 1 from businesses where id = v_reception.business_id and owner_id = auth.uid()) then
    raise exception 'Boutique non autorisée pour cette réception';
  end if;

  if v_reception.statut <> 'brouillon' then
    raise exception 'Cette réception a déjà été validée ou annulée.';
  end if;

  select count(*) into v_nb_lignes from reception_lignes where reception_id = p_reception_id;
  if v_nb_lignes = 0 then
    raise exception 'Une réception doit contenir au moins une ligne.';
  end if;

  for v_ligne in select * from reception_lignes where reception_id = p_reception_id loop
    if v_ligne.quantite <= 0 then
      raise exception 'Quantité invalide pour une ligne de réception.';
    end if;
    if v_ligne.cout_unitaire < 0 or coalesce(v_ligne.frais_annexes, 0) < 0 then
      raise exception 'Les coûts et frais annexes ne peuvent pas être négatifs.';
    end if;
    if v_ligne.article_id is null and coalesce(trim(v_ligne.nom_nouvel_article), '') = '' then
      raise exception 'Le nom du nouvel article est obligatoire.';
    end if;
    v_total_achat := v_total_achat + (v_ligne.quantite * v_ligne.cout_unitaire);
  end loop;

  if exists (
    select 1 from reception_lignes
    where reception_id = p_reception_id and article_id is null
    group by lower(trim(nom_nouvel_article))
    having count(*) > 1
  ) then
    raise exception 'Deux lignes ne peuvent pas créer un article du même nom.';
  end if;

  if exists (
    select 1 from reception_lignes rl
    join articles a on a.business_id = v_reception.business_id and lower(trim(a.nom)) = lower(trim(rl.nom_nouvel_article))
    where rl.reception_id = p_reception_id and rl.article_id is null
  ) then
    raise exception 'Un article du même nom existe déjà dans le stock.';
  end if;

  for v_ligne in select * from reception_lignes where reception_id = p_reception_id order by created_at asc, id asc loop
    v_rang := v_rang + 1;
    v_article_id := v_ligne.article_id;

    if v_article_id is null then
      insert into articles (business_id, nom, categorie_id, unite, image_url, prix_achat, frais_annexes, stock, seuil)
      values (
        v_reception.business_id,
        trim(v_ligne.nom_nouvel_article),
        v_ligne.categorie_id,
        coalesce(v_ligne.unite, 'unite'),
        v_ligne.image_url,
        0, 0, 0, 0
      )
      returning id into v_article_id;
    end if;

    select stock, prix_achat, frais_annexes
      into v_stock_actuel, v_prix_achat_actuel, v_frais_annexes_actuel
      from articles where id = v_article_id for update;

    -- Frais groupés : part au prorata de la valeur d'achat de la ligne
    -- (quantité × coût unitaire) ; la dernière ligne reçoit le reste exact
    -- plutôt qu'une part arrondie séparément, pour que la somme des parts
    -- égale toujours le total saisi. Sinon, le montant saisi directement
    -- sur la ligne (0 si vide).
    if v_reception.frais_groupes then
      if v_rang = v_nb_lignes then
        v_part := round(v_reception.frais_total - v_cumul_frais, 2);
      elsif v_total_achat > 0 then
        v_part := round(v_reception.frais_total * (v_ligne.quantite * v_ligne.cout_unitaire) / v_total_achat, 2);
        v_cumul_frais := v_cumul_frais + v_part;
      else
        v_part := 0;
      end if;
    else
      v_part := coalesce(v_ligne.frais_annexes, 0);
    end if;

    v_cout_revient := round(v_ligne.cout_unitaire + (v_part / v_ligne.quantite), 2);

    v_nouveau_prix_achat := calculer_cout_moyen_pondere(v_stock_actuel, v_prix_achat_actuel, v_ligne.quantite, v_ligne.cout_unitaire);
    v_nouveaux_frais_annexes := calculer_cout_moyen_pondere(v_stock_actuel, v_frais_annexes_actuel, v_ligne.quantite, v_part / v_ligne.quantite);

    update articles
      set stock = stock + v_ligne.quantite,
          prix_achat = v_nouveau_prix_achat,
          frais_annexes = v_nouveaux_frais_annexes
      where id = v_article_id;

    update reception_lignes
      set article_id = v_article_id,
          frais_repartis = v_part,
          cout_revient_unitaire = v_cout_revient,
          stock_avant = v_stock_actuel,
          stock_apres = v_stock_actuel + v_ligne.quantite,
          prix_achat_moyen_avant = v_prix_achat_actuel,
          prix_achat_moyen_apres = v_nouveau_prix_achat,
          frais_annexes_moyen_avant = v_frais_annexes_actuel,
          frais_annexes_moyen_apres = v_nouveaux_frais_annexes
      where id = v_ligne.id;
  end loop;

  update receptions set statut = 'validee', validated_at = now()
    where id = p_reception_id
    returning * into v_reception;

  return v_reception;
end;
$$;

grant execute on function valider_reception(uuid) to authenticated;

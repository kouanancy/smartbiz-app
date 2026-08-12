-- ============================================================
-- DURCISSEMENT RLS : subscription_status/is_admin non modifiables
-- directement par le commerçant, même via un appel API hors de l'app.
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- Nécessite supabase-businesses-admin-migration.sql (colonne is_admin) et
-- supabase-admin-scope-abonnement-migration.sql (is_admin_user(),
-- admin_mark_subscription_paid, admin_reject_payment).
-- ============================================================

-- La policy RLS de businesses ("Le propriétaire gère sa boutique", for
-- all using (owner_id = auth.uid())) n'a jamais restreint les COLONNES
-- qu'un commerçant peut écrire sur sa propre ligne — seulement les
-- LIGNES visibles. Combiné aux droits larges accordés par défaut par
-- Supabase à authenticated sur les tables du schéma public, un
-- commerçant authentifié pouvait donc, via un appel direct à l'API REST
-- (pas besoin de passer par l'app ni par aucun code de ce dépôt — c'est
-- pour ça qu'aucun bug applicatif n'a été trouvé côté client ou
-- fonction SQL), modifier n'importe quelle colonne de sa propre ligne :
-- subscription_status (se remettre 'actif' lui-même, sans jamais faire
-- valider de justificatif par l'administratrice) et même is_admin
-- (s'auto-accorder les droits admin, y compris dès l'inscription, avant
-- même la première connexion). C'est la cause la plus probable d'un cas
-- réel où un commerçant a retrouvé l'accès à son compte sans validation
-- admin, malgré l'absence de tout code applicatif qui ferait ça.
--
-- On restreint donc INSERT et UPDATE à des listes de colonnes précises :
-- INSERT (une seule fois, à l'inscription, voir ensureBusiness dans
-- lib/AuthProvider.js) peut encore poser subscription_status='essai' et
-- subscription_expires_at (fin d'essai) — c'est le comportement normal
-- de la toute première ligne créée pour un compte — mais jamais is_admin,
-- qui garde toujours sa valeur par défaut (false) quoi que le client
-- envoie dans la requête d'insertion. UPDATE ne couvre plus que les
-- colonnes que l'app modifie légitimement elle-même depuis le client
-- (Paramètres, choix de formule, numérotation des commandes) — jamais
-- subscription_status, subscription_expires_at, is_admin, owner_id ou
-- email. DELETE est retiré aussi : un commerçant qui supprimerait sa
-- propre ligne businesses obtiendrait un nouvel essai gratuit de 7 jours
-- à la prochaine connexion (ensureBusiness recrée la ligne faute d'en
-- trouver une existante) — même famille de contournement que
-- subscription_status.
revoke insert, update, delete on businesses from authenticated;

grant insert (owner_id, email, name, plan, subscription_status, subscription_expires_at)
  on businesses to authenticated;

grant update (name, logo_url, theme_key, mode_affichage, devise, langue, notif_email, confirmation_email, plan, next_numero)
  on businesses to authenticated;

-- ------------------------------------------------------------
-- Bascule paresseuse de l'expiration (essai/actif dépassé) : jusqu'ici un
-- update direct du client (lib/AuthProvider.js, verifierExpirationAbonnement),
-- devenu impossible avec le GRANT UPDATE restreint ci-dessus — c'était le
-- seul autre endroit du code (en dehors des fonctions admin_*) à écrire
-- subscription_status. SECURITY DEFINER : recalcule tout côté serveur à
-- partir de la ligne réelle en base (jamais des valeurs envoyées par le
-- client), donc aucune confiance requise dans l'appelant au-delà de
-- "c'est bien le propriétaire de cette boutique" (vérifié explicitement
-- ci-dessous, contrairement aux fonctions admin_* qui vérifient
-- is_admin_user()). Même correspondance essai/actif que
-- EXPIRATION_SUIVANTE dans lib/AuthProvider.js — à garder synchronisée.
-- ------------------------------------------------------------
create or replace function verifier_expiration_abonnement(p_business_id uuid)
returns setof businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_expire timestamptz;
  v_nouveau text;
begin
  select subscription_status, subscription_expires_at
    into v_statut, v_expire
    from businesses
    where id = p_business_id and owner_id = auth.uid();

  if not found then
    raise exception 'Boutique introuvable ou accès refusé';
  end if;

  v_nouveau := case v_statut
    when 'essai' then 'en_attente_paiement'
    when 'actif' then 'expire'
    else null
  end;

  if v_nouveau is null or v_expire is null or v_expire > now() then
    return query select * from businesses where id = p_business_id;
    return;
  end if;

  return query
    update businesses
    set subscription_status = v_nouveau
    where id = p_business_id
    returning *;
end;
$$;

grant execute on function verifier_expiration_abonnement(uuid) to authenticated;

// Service worker minimal : uniquement les notifications push (pas de
// cache offline, hors scope ici). Reçoit le payload JSON envoyé par
// app/api/push-admin-paiement (title/body/url), affiche la notification,
// et ramène l'utilisateur sur l'app (onglet existant si déjà ouvert,
// sinon nouvel onglet) au clic.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Doka", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Doka";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/admin" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

import { GoogleAuthProvider, OAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { auth, db, PROPOSALS } from "./firebase.js";
import { categoryColor, pinIcon, coordsFromGoogleUrl } from "./map-core.js";

const $ = (id) => document.getElementById(id);

function createProvider(type) {
  if (type === "google") {
    const p = new GoogleAuthProvider();
    p.addScope("email");
    p.addScope("profile");
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  }
  const p = new OAuthProvider("microsoft.com");
  p.addScope("email");
  p.addScope("openid");
  p.addScope("profile");
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

function profileOf(user) {
  const provider = user.providerData[0] || {};
  return {
    name: (provider.displayName || user.displayName || "").trim(),
    email: (provider.email || user.email || "").trim().toLowerCase()
  };
}

export function setupProposals(map, data) {
  const panel = $("proposePanel");
  const form = $("proposeForm");
  const login = $("proposeLogin");
  const msg = $("proposeMsg");
  const sidebar = $("sidebar");
  let user = null;
  let open = false;
  let draft = null;

  const options = [...(data.categories || []).map((c) => [c.name, c.name]), ["", "Otros"]];
  form.elements.category.replaceChildren(...options.map(([value, label]) => new Option(label, value)));

  function readCoords() {
    const lat = parseFloat(form.elements.lat.value);
    const lng = parseFloat(form.elements.lng.value);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lat, lng];
  }

  function showDraft() {
    const coords = open && readCoords();
    if (!coords) {
      if (draft) map.removeLayer(draft);
      draft = null;
      return;
    }
    const icon = pinIcon(categoryColor(data, form.elements.category.value), { draft: true });
    if (draft) {
      draft.setLatLng(coords).setIcon(icon);
      return;
    }
    draft = L.marker(coords, { icon, draggable: true, zIndexOffset: 1000, title: "Sitio propuesto" }).addTo(map);
    draft.on("dragend", () => setCoords(draft.getLatLng()));
  }

  function setCoords(latlng) {
    form.elements.lat.value = Number(latlng.lat.toFixed(7));
    form.elements.lng.value = Number(latlng.lng.toFixed(7));
    showDraft();
  }

  function render() {
    login.hidden = !!user;
    form.hidden = !user;
    if (user) {
      const profile = profileOf(user);
      $("proposeUser").textContent = profile.name || profile.email || "tu cuenta";
    }
  }

  function setOpen(value) {
    open = value;
    panel.hidden = !value;
    $("proposeBtn").hidden = value;
    sidebar.classList.toggle("is-proposing", value);
    document.body.classList.remove("sidebar-collapsed");
    if (!value) msg.textContent = "";
    render();
    showDraft();
    setTimeout(() => map.invalidateSize(), 300);
    if (value && matchMedia("(min-width: 901px)").matches) (user ? form.elements.name : login.querySelector("button")).focus();
  }

  $("proposeBtn").addEventListener("click", () => setOpen(true));
  $("proposeClose").addEventListener("click", () => setOpen(false));

  login.querySelectorAll("[data-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      msg.textContent = "";
      login.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        const result = await signInWithPopup(auth, createProvider(btn.dataset.provider));
        user = result.user;
        render();
        form.elements.name.focus();
      } catch (e) {
        msg.textContent = e.code === "auth/popup-blocked"
          ? "El navegador ha bloqueado la ventana para entrar. Permite las ventanas emergentes en esta web."
          : e.code === "auth/popup-closed-by-user"
            ? "Has cerrado la ventana antes de terminar."
            : "No se pudo iniciar sesión. Inténtalo de nuevo.";
      } finally {
        login.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    });
  });

  $("proposeLogout").addEventListener("click", async () => {
    await signOut(auth);
    user = null;
    render();
  });

  form.elements.googleUrl.addEventListener("input", () => {
    const coords = coordsFromGoogleUrl(form.elements.googleUrl.value);
    if (!coords) return;
    form.elements.lat.value = coords[0];
    form.elements.lng.value = coords[1];
    showDraft();
    map.setView(coords, Math.max(map.getZoom(), 17));
  });

  ["lat", "lng", "category"].forEach((name) => form.elements[name].addEventListener("input", showDraft));

  map.on("click", (e) => {
    if (open && user) setCoords(e.latlng);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const coords = readCoords();
    if (!coords) {
      msg.textContent = "Falta la posición: pulsa en el mapa donde está el sitio.";
      return;
    }
    const profile = profileOf(user);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    msg.textContent = "Enviando…";
    try {
      await addDoc(collection(db, PROPOSALS), {
        name: form.elements.name.value.trim(),
        category: form.elements.category.value,
        description: form.elements.description.value.trim(),
        coordinates: coords,
        googleUrl: form.elements.googleUrl.value.trim(),
        uid: user.uid,
        author_name: profile.name.slice(0, 120),
        author_email: profile.email.slice(0, 200),
        created_at: serverTimestamp()
      });
      form.reset();
      showDraft();
      msg.textContent = "¡Gracias! Hemos recibido tu propuesta y la revisaremos antes de publicarla.";
    } catch (err) {
      console.error("[MAPA] Error al enviar la propuesta", err);
      msg.textContent = err.code === "permission-denied" ? "No se pudo enviar: revisa que todos los datos sean correctos." : "No se pudo enviar la propuesta. Inténtalo de nuevo.";
    } finally {
      submit.disabled = false;
    }
  });

  onAuthStateChanged(auth, (u) => {
    user = u;
    render();
  });
}

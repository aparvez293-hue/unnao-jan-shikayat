/* Unnao Jan Shikayat
 * Replace these values with your Supabase Project URL and publishable/anon key.
 * Never put a service_role/secret key in this public file.
 */
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE";
const CONFIGURED = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");
const db = CONFIGURED && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = (s) => document.querySelector(s);
let language = "hi";
const say = (hi, en) => language === "hi" ? hi : en;
function setMessage(el, text, kind="") {
  el.textContent = text;
  el.className = "message" + (kind ? " " + kind : "");
}
function ensureConfigured() {
  if (!db) throw new Error("Website database setup abhi complete nahi hai. Admin se sampark karein. / Database setup is incomplete.");
}
$("#langToggle").addEventListener("click", () => {
  language = language === "hi" ? "en" : "hi";
  document.documentElement.lang = language;
  $("#langToggle").textContent = language === "hi" ? "English" : "हिन्दी";
  document.querySelectorAll("[data-hi][data-en]").forEach(el => el.textContent = el.dataset[language]);
});

$("#complaintForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const msg = $("#formMessage");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    ensureConfigured();
    const f = new FormData(form);
    const payload = {
      name: String(f.get("name") || "").trim(),
      phone: String(f.get("phone") || "").trim(),
      category: String(f.get("category") || "").trim(),
      locality: String(f.get("locality") || "").trim(),
      location: String(f.get("location") || "").trim(),
      details: String(f.get("details") || "").trim()
    };
    if (payload.name.length < 2 || payload.phone.replace(/\D/g,"").length < 10 ||
        payload.details.length < 10) throw new Error("कृपया सही नाम, मोबाइल नंबर और कम-से-कम 10 अक्षरों की शिकायत लिखें।");
    const { data, error } = await db.rpc("submit_complaint", {
      p_name: payload.name,
      p_phone: payload.phone,
      p_category: payload.category,
      p_locality: payload.locality,
      p_location: payload.location,
      p_details: payload.details
    });
    if (error) throw error;
    setMessage(msg, say("शिकायत दर्ज हो गई। आपकी Complaint ID: ", "Complaint submitted. Your Complaint ID: ") + data +
      say(" — इसे सुरक्षित रखें। अभी शिकायत केवल इस पोर्टल पर दर्ज हुई है; सरकारी कार्यालय को भेजना एडमिन की समीक्षा के बाद होगा।",
          " — save this ID. The complaint is stored on this portal; an admin will review it before forwarding to an office."), "success");
    form.reset();
  } catch (err) {
    console.error(err);
    setMessage(msg, err.message || "शिकायत जमा नहीं हो सकी। कृपया बाद में प्रयास करें।", "error");
  } finally { button.disabled = false; }
});

/* Public tracking intentionally does not query the private complaints table.
   To avoid exposing names/phone/details, configure a secure Supabase Edge Function
   that returns only tracking_code + status, then connect it here. */
$("#trackingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage($("#trackingMessage"),
    say("सुरक्षित tracking सुविधा अभी configure नहीं है। अपनी Complaint ID लेकर पोर्टल एडमिन से स्थिति पूछें।",
        "Secure public tracking is not configured yet. Contact the portal admin with your Complaint ID."),
    "error");
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    ensureConfigured();
    const f = new FormData(form);
    const { error } = await db.auth.signInWithPassword({
      email: String(f.get("email")), password: String(f.get("password"))
    });
    if (error) throw error;
    setMessage($("#adminMessage"), "Admin login successful.", "success");
    $("#logoutButton").hidden = false;
    $("#adminArea").hidden = false;
    await loadComplaints();
  } catch (err) {
    setMessage($("#adminMessage"), err.message || "Login failed.", "error");
  }
});
$("#logoutButton").addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  $("#adminArea").hidden = true;
  $("#logoutButton").hidden = true;
  $("#complaintsList").replaceChildren();
  setMessage($("#adminMessage"), "Logged out.");
});
$("#refreshButton").addEventListener("click", loadComplaints);

async function loadComplaints() {
  const list = $("#complaintsList");
  list.textContent = "Loading…";
  try {
    ensureConfigured();
    const { data, error } = await db.from("complaints")
      .select("id,tracking_code,name,phone,category,locality,location,details,status,created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    list.replaceChildren();
    if (!data.length) { list.textContent = "No complaints yet."; return; }
    for (const c of data) {
      const card = document.createElement("article");
      card.className = "complaint-card";
      const h = document.createElement("h4"); h.textContent = `${c.tracking_code} · ${c.category}`;
      const meta = document.createElement("p"); meta.className = "meta";
      meta.textContent = `${new Date(c.created_at).toLocaleString()} · ${c.locality}`;
      const who = document.createElement("p"); who.textContent = `${c.name} · ${c.phone}`;
      const where = document.createElement("p"); where.textContent = c.location || "Specific location not provided";
      const details = document.createElement("p"); details.textContent = c.details;
      const select = document.createElement("select");
      for (const status of ["Received","Reviewed","Forwarded","In Progress","Resolved","Rejected"]) {
        const opt = document.createElement("option"); opt.value = status; opt.textContent = status;
        if (c.status === status) opt.selected = true; select.append(opt);
      }
      select.setAttribute("aria-label", "Update complaint status");
      select.addEventListener("change", async () => {
        const { error } = await db.from("complaints").update({status:select.value}).eq("id", c.id);
        if (error) { setMessage($("#adminMessage"), error.message, "error"); select.value = c.status; }
        else { c.status = select.value; setMessage($("#adminMessage"), "Status updated.", "success"); }
      });
      const actions = document.createElement("div"); actions.className = "actions";
      const mail = document.createElement("a");
      const subject = encodeURIComponent(`Public complaint ${c.tracking_code} - ${c.category}`);
      const body = encodeURIComponent(
        `Complaint ID: ${c.tracking_code}\nName: ${c.name}\nPhone: ${c.phone}\nCategory: ${c.category}\nWard/Locality: ${c.locality}\nLocation: ${c.location}\nDetails: ${c.details}\nSubmitted: ${c.created_at}\n\nPlease review this complaint.`
      );
      // Do not guess official email addresses. Admin must set the verified office email in their mail app.
      mail.href = `mailto:?subject=${subject}&body=${body}`;
      mail.textContent = "Prepare email to office";
      mail.title = "Choose the verified official recipient in your email app";
      const copy = document.createElement("button"); copy.className = "quiet"; copy.type = "button"; copy.textContent = "Copy complaint";
      copy.addEventListener("click", async () => {
        const text = `Complaint ID: ${c.tracking_code}\nName: ${c.name}\nPhone: ${c.phone}\nCategory: ${c.category}\nLocality: ${c.locality}\nLocation: ${c.location}\nDetails: ${c.details}\nStatus: ${c.status}`;
        try { await navigator.clipboard.writeText(text); setMessage($("#adminMessage"), "Complaint copied.", "success"); }
        catch { setMessage($("#adminMessage"), text); }
      });
      actions.append(mail, copy);
      card.append(h, meta, who, where, details, select, actions);
      list.append(card);
    }
  } catch (err) {
    list.textContent = "";
    setMessage($("#adminMessage"), err.message || "Could not load complaints.", "error");
  }
}

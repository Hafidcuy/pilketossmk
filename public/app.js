/* =========================================================
   Pilketos SMK Krian 1 Sidoarjo — frontend (Vercel + Supabase)
   Semua data & keamanan diverifikasi server-side via /api.
   ========================================================= */

const ROUTES = ['voting', 'hasil', 'admin'];
const RECEIPT_KEY = 'pilketos_receipt';

let publicData = { config: {}, candidates: [], results: null };
let adminData = null;
let adminAuthed = false;
let voteStep = 1;
let draft = null;
let receipt = null;
let justVoted = false;
let loadFailed = false;
const captcha = {
  vote: { token: '', img: null, input: null },
  login: { token: '', img: null, input: null }
};

/* ------------------ Utilitas ------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

async function api(path, options = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw Object.assign(new Error('Tidak dapat terhubung ke server. Coba lagi.'), { status: 0 });
  }
  let data = {};
  try { data = await response.json(); } catch { /* abaikan */ }
  if (!response.ok) {
    throw Object.assign(new Error(data.error || `Permintaan gagal (${response.status}).`), { status: response.status });
  }
  return data;
}

async function safeAdmin(action) {
  try { await action(); return true; }
  catch (err) {
    if (err.status === 401) {
      adminAuthed = false;
      adminData = null;
      renderAdmin();
      toast('Sesi admin berakhir. Silakan login kembali.', 'err');
    } else {
      toast(err.message || 'Permintaan gagal.', 'err');
    }
    return false;
  }
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function openModal(title, body, actions = '') {
  $('#modalContent').innerHTML = `<h2>${esc(title)}</h2>${body}` +
    (actions ? `<div class="modal-actions">${actions}</div>` : '');
  $('#modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ------------------ CAPTCHA server ------------------ */
async function refreshCaptcha(which) {
  const data = await api('/api/captcha');
  captcha[which].token = data.token;
  const img = which === 'vote' ? $('#voteCaptcha') : $('#loginCaptcha');
  if (img) img.src = data.image;
  if (captcha[which].input) captcha[which].input.value = '';
  return data;
}

/* ------------------ Routing ------------------ */
function currentRoute() {
  const hash = (location.hash || '').replace('#', '');
  return ROUTES.includes(hash) ? hash : 'voting';
}
function renderRoute() {
  const route = currentRoute();
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + route));
  $$('.main-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  $('#mainNav').classList.remove('open');
  if (route === 'voting') renderVoting();
  if (route === 'hasil') renderResults();
  if (route === 'admin') renderAdmin();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function go(route) {
  if (currentRoute() === route) renderRoute();
  else location.hash = route;
}

/* ------------------ Helper paslon ------------------ */
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase() : '?';
}
function paslonName(c) { return c.wakil ? `${c.ketua} & ${c.wakil}` : c.ketua; }
function paslonLabel(c) { return `Paslon ${c.number} — ${paslonName(c)}`; }
function avatarHTML(c, cls = 'paslon-photo') {
  return c.foto
    ? `<div class="${cls}"><img src="${esc(c.foto)}" alt="Foto paslon"></div>`
    : `<div class="${cls}"><span>${esc(initials(c.ketua))}</span></div>`;
}
function getCandidate(id) { return publicData.candidates.find((c) => c.id === id); }
function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(iso); }
}

/* Kompres foto di browser agar ringan untuk HP & upload cepat. */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return reject(new Error('Format foto harus PNG, JPG, atau WebP.'));
    }
    if (file.size > 8 * 1024 * 1024) {
      return reject(new Error('Foto sumber terlalu besar (maks. 8 MB).'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas foto.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gambar tidak bisa dibuka.'));
      img.onload = () => {
        const max = 512;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const data = canvas.toDataURL('image/jpeg', 0.8);
        if (data.length > 380000) {
          return reject(new Error('Foto masih terlalu besar. Coba gambar yang lebih sederhana.'));
        }
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------ Voting ------------------ */
function setProgress(step) {
  $$('[data-progress]').forEach((el) => {
    const n = Number(el.dataset.progress);
    el.classList.toggle('active', n === step);
    el.classList.toggle('done', n < step);
  });
}

function receiptBox(title, message, extra = '') {
  return `
    <div class="wizard-body">
      <div class="${justVoted ? 'success-box' : 'already-box'}">
        <div class="success-icon"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div>
        <h2>${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="receipt"><div><small>Bukti voting</small><strong>${esc(receipt)}</strong></div></div>
        ${extra}
        <div class="wizard-actions" style="justify-content:center">
          <a href="#hasil" class="btn btn-primary">Lihat Hasil →</a>
          <button class="btn btn-outline" data-go="voting">Kembali</button>
        </div>
      </div>
    </div>`;
}

function renderVoting() {
  if (loadFailed) return;
  const cfg = publicData.config || {};
  $('#votingPeriodText').textContent =
    `${cfg.title || 'Pilketos'} · ${publicData.candidates.length} paslon · Periode: ${cfg.period || '—'}`;
  const content = $('#votingContent');

  const saved = receipt || sessionStorage.getItem(RECEIPT_KEY);
  if (saved) {
    receipt = saved;
    setProgress(3);
    return void (content.innerHTML = receiptBox(
      justVoted ? 'Suara berhasil dikirim!' : 'Kamu sudah menggunakan hak pilihmu',
      justVoted
        ? 'Terima kasih telah menggunakan hak pilihmu dalam Pilketos SMK Krian 1 Sidoarjo.'
        : 'Satu identitas & satu perangkat hanya dapat mengirim satu suara.',
      draft ? `<p style="font-size:12.5px">Pilihanmu: <strong>${esc(paslonLabel(getCandidate(draft.candidateId) || { number: '?', ketua: 'Paslon' }))}</strong></p>` : ''
    ));
  }

  if (!cfg.votingOpen) {
    setProgress(1);
    content.innerHTML = `
      <div class="wizard-body">
        <div class="notice notice-warn" style="margin-bottom:18px"><span>!</span><div><strong>Voting sedang ditutup.</strong> Hubungi panitia untuk informasi lebih lanjut.</div></div>
        <div class="wizard-actions"><button class="btn btn-outline" data-go="admin">Buka Panel Admin</button></div>
      </div>`;
    return;
  }

  if (voteStep === 1) {
    setProgress(1);
    const selected = draft?.candidateId || '';
    const cards = publicData.candidates.map((c) => {
      const misi = (c.misi || []).map((m) => `<li>${esc(m)}</li>`).join('');
      return `
        <div class="paslon-card ${selected === c.id ? 'selected' : ''}">
          <label class="paslon-main">
            <input type="radio" name="candidateId" value="${esc(c.id)}" ${selected === c.id ? 'checked' : ''}>
            <span class="radio-mark"></span>
            ${avatarHTML(c)}
            <span class="paslon-info">
              <span class="paslon-badge">PASLON ${esc(c.number)}</span>
              <strong>${esc(paslonName(c))}</strong>
              <small>${esc(c.kelas || '—')}</small>
            </span>
          </label>
          <p class="paslon-vision">${esc(c.visi || 'Visi belum tersedia.')}</p>
          <details class="paslon-details">
            <summary>Lihat visi &amp; misi</summary>
            <ul><li><strong>Visi:</strong> ${esc(c.visi || '—')}</li>${misi || '<li>Misi belum tersedia.</li>'}</ul>
          </details>
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="wizard-body">
        <h3>Isi Identitas &amp; Pilih Paslon</h3>
        <p style="font-size:12.5px">Isi sesuai data sekolah. Identitas yang sama hanya dapat voting sekali.</p>
        <form id="voteForm" class="wizard-form" novalidate autocomplete="off">
          <div class="form-row">
            <div class="field">
              <label for="voteNama">Nama Lengkap</label>
              <input id="voteNama" name="nama" maxlength="80" placeholder="Nama lengkap siswa" value="${esc(draft?.nama || '')}" required>
            </div>
            <div class="field">
              <label for="voteKelas">Kelas</label>
              <input id="voteKelas" name="kelas" maxlength="30" placeholder="Contoh: XI RPL 1" value="${esc(draft?.kelas || '')}" required>
            </div>
          </div>
          <div class="field">
            <label for="voteJurusan">Jurusan</label>
            <input id="voteJurusan" name="jurusan" maxlength="60" placeholder="Contoh: Rekayasa Perangkat Lunak" value="${esc(draft?.jurusan || '')}" required>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:var(--heading);margin-bottom:8px">Pilih Salah Satu Paslon</label>
            <div class="paslon-grid">${cards || '<div class="empty">Belum ada paslon. Hubungi panitia.</div>'}</div>
          </div>
          <div class="field">
            <label for="voteCaptchaInput">Kode keamanan (captcha)</label>
            <div class="captcha-row">
              <img id="voteCaptcha" width="160" height="46" alt="Kode captcha voting" title="Klik untuk mengganti kode">
              <button type="button" class="btn btn-outline btn-sm" id="refreshVoteCaptcha" title="Ganti kode captcha">Ganti</button>
            </div>
            <input id="voteCaptchaInput" type="text" maxlength="8" placeholder="Masukkan kode di atas" autocomplete="off" required>
            <div class="field-hint">Kode diverifikasi server dan hanya bisa dipakai sekali.</div>
          </div>
          <input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="notice notice-info"><span>i</span><div>Pastikan alamat website resmi sekolah. Jangan pernah membagikan kode atau PIN kepada siapa pun.</div></div>
          <div class="wizard-actions"><button type="submit" class="btn btn-primary" ${publicData.candidates.length ? '' : 'disabled'}>Lanjut Konfirmasi →</button></div>
        </form>
      </div>`;
    captcha.vote.input = $('#voteCaptchaInput');
    refreshCaptcha('vote').catch(() => toast('Gagal memuat captcha.', 'err'));
    return;
  }

  if (voteStep === 2 && draft) {
    const c = getCandidate(draft.candidateId);
    setProgress(2);
    content.innerHTML = `
      <div class="wizard-body">
        <h3>Konfirmasi Pilihanmu</h3>
        <p style="font-size:12.5px">Periksa kembali data berikut. Setelah dikonfirmasi, pilihan tidak dapat diubah.</p>
        <div class="confirm-box">
          ${c ? avatarHTML(c, 'confirm-avatar') : '<div class="confirm-avatar">?</div>'}
          <span class="eyebrow" style="margin-bottom:5px">PILIHAN KAMU</span>
          <h2>${esc(c ? `Paslon ${c.number}` : '—')}</h2>
          <p style="font-size:12.5px">${esc(c ? paslonName(c) : '')}</p>
          <div style="margin-top:18px;text-align:left">
            <div class="confirm-row"><span>Nama Lengkap</span><strong>${esc(draft.nama)}</strong></div>
            <div class="confirm-row"><span>Kelas</span><strong>${esc(draft.kelas)}</strong></div>
            <div class="confirm-row"><span>Jurusan</span><strong>${esc(draft.jurusan)}</strong></div>
          </div>
        </div>
        <div class="notice notice-warn" style="margin-top:16px"><span>!</span><div><strong>Pilihan bersifat final.</strong> Kamu tidak dapat mengulang voting dengan identitas yang sama.</div></div>
        <div class="wizard-actions">
          <button class="btn btn-outline" id="backVoteBtn">← Kembali</button>
          <button class="btn btn-primary" id="confirmVoteBtn">Konfirmasi &amp; Kirim Suara</button>
        </div>
      </div>`;
    return;
  }

  voteStep = 1;
  renderVoting();
}

async function submitVoteStep1(form) {
  if (form.website.value) return toast('Pengiriman ditolak.', 'err');
  const nama = form.nama.value.trim();
  const kelas = form.kelas.value.trim();
  const jurusan = form.jurusan.value.trim();
  const candidateId = form.candidateId?.value || '';
  const answer = $('#voteCaptchaInput').value.trim();

  if (!nama || !kelas || !jurusan) return toast('Nama lengkap, kelas, dan jurusan wajib diisi.', 'err');
  if (!candidateId) return toast('Silakan pilih salah satu paslon.', 'err');
  if (!answer) return toast('Masukkan kode captcha.', 'err');

  draft = { nama, kelas, jurusan, candidateId, captchaToken: captcha.vote.token, captchaAnswer: answer };
  voteStep = 2;
  renderVoting();
}

async function confirmVote() {
  const btn = $('#confirmVoteBtn');
  if (btn) btn.disabled = true;
  try {
    const data = await api('/api/vote', {
      method: 'POST',
      body: {
        nama: draft.nama, kelas: draft.kelas, jurusan: draft.jurusan,
        paslonId: draft.candidateId,
        captchaToken: draft.captchaToken,
        captchaAnswer: draft.captchaAnswer
      }
    });
    receipt = data.receipt;
    justVoted = true;
    sessionStorage.setItem(RECEIPT_KEY, receipt);
    voteStep = 3;
    renderVoting();
    await loadPublic();
    toast('Voting berhasil! Suaramu tercatat.', 'ok');
  } catch (err) {
    toast(err.message || 'Voting gagal.', 'err');
    draft.captchaToken = '';
    voteStep = 1;
    renderVoting();
    await refreshCaptcha('vote').catch(() => {});
  }
}

/* ------------------ Hasil ------------------ */
function resultsCards(counts, total, label) {
  const list = [...publicData.candidates].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  const leader = list[0] && (counts[list[0].id] || 0) > 0 ? paslonName(list[0]) : '—';
  return `
    <div class="results-summary">
      <div class="summary-box"><span class="summary-ico">OK</span><div><strong>${total}</strong><small>Total Suara</small></div></div>
      <div class="summary-box"><span class="summary-ico">${String(list.length).padStart(2, '0')}</span><div><strong>${list.length}</strong><small>Jumlah Paslon</small></div></div>
      <div class="summary-box"><span class="summary-ico">#1</span><div><strong style="font-size:15px">${esc(leader)}</strong><small>Sementara Memimpin</small></div></div>
    </div>
    <div class="results-card">
      ${list.map((c, i) => {
        const count = counts[c.id] || 0;
        const percent = total ? Math.round((count / total) * 100) : 0;
        return `
          <div class="result-item">
            <div class="result-top">
              <div class="result-rank ${i === 0 && count > 0 ? 'first' : ''}">${i + 1}</div>
              ${avatarHTML(c, 'result-avatar')}
              <div class="result-name"><strong>${esc(paslonLabel(c))}</strong><small>${esc(c.kelas || '—')}</small></div>
              <div class="result-count"><strong>${count}</strong><small>suara · ${percent}%</small></div>
            </div>
            <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
          </div>`;
      }).join('')}
    </div>
    <div class="results-foot"><span>${esc(label)}</span><span>Panitia Pilketos</span></div>`;
}

function lockedBox(title, message) {
  return `
    <div class="locked-box">
      <div class="locked-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
      <h3>${esc(title)}</h3>
      <p style="font-size:13px">${esc(message)}</p>
      <div style="display:flex;gap:9px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-outline" data-go="voting">Kembali ke Voting</button>
        <button class="btn btn-primary" data-go="admin">Buka Panel Admin</button>
      </div>
    </div>`;
}

function renderResults() {
  const content = $('#resultsContent');
  if (adminAuthed && adminData) {
    content.innerHTML = `
      <div class="notice notice-info" style="margin-bottom:16px"><span>i</span><div><strong>Pratinjau admin — data langsung.</strong> Publik melihat hasil yang diterbitkan: <strong>${esc(formatDate(adminData.config.publishedAt))}</strong>.</div></div>
      ${resultsCards(adminData.tally || {}, adminData.total || 0, 'Data langsung untuk panitia.')}`;
    return;
  }
  if (!publicData.config.leaderboardPublic) {
    content.innerHTML = lockedBox('Leaderboard belum dibuka untuk publik', 'Panitia belum mengizinkan hasil untuk dilihat. Status ini dapat diubah dari panel Admin.');
    return;
  }
  if (!publicData.results) {
    content.innerHTML = lockedBox('Hasil belum diterbitkan', 'Suara sudah masuk, tetapi panitia belum menerbitkan leaderboard. Silakan cek kembali nanti.');
    return;
  }
  content.innerHTML = resultsCards(
    publicData.results.counts || {},
    publicData.results.total || 0,
    `Diterbitkan oleh panitia pada ${formatDate(publicData.results.at)}. Pembaruan menunggu izin admin.`
  );
}

/* ------------------ Admin ------------------ */
function updateLoginNote() {
  const note = $('#loginSecurityNote');
  const sisa = adminData ? Math.max(0, 5 - (adminData.failedAttempts || 0)) : 5;
  note.classList.remove('locked');
  note.innerHTML = `Gunakan PIN yang diberikan panitia. Sisa percobaan: <strong>${sisa}</strong>.`;
}

async function loadAdmin() {
  adminData = await api('/api/admin/state');
  adminAuthed = true;
}

async function doLogin() {
  const pin = $('#pinInput').value;
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: { pin, captchaToken: captcha.login.token, captchaAnswer: $('#loginCaptchaInput').value }
    });
    $('#pinInput').value = '';
    await loadAdmin();
    await loadPublic();
    renderAdmin();
    renderResults();
    toast('Berhasil masuk ke panel admin.', 'ok');
  } catch (err) {
    toast(err.message || 'Login gagal.', 'err');
    await refreshCaptcha('login').catch(() => {});
    renderAdmin();
  }
}

async function doLogout() {
  await safeAdmin(async () => { await api('/api/admin/logout', { method: 'POST' }); });
  adminAuthed = false;
  adminData = null;
  renderAdmin();
  renderResults();
}

function renderAdmin() {
  $('#adminLogin').classList.toggle('hidden', adminAuthed);
  $('#adminPanel').classList.toggle('hidden', !adminAuthed);
  captcha.login.input = $('#loginCaptchaInput');
  if (!adminAuthed) { updateLoginNote(); return; }
  const cfg = adminData?.config || {};

  $('#cfgTitle').value = cfg.title || '';
  $('#cfgPeriod').value = cfg.period || '';
  $('#cfgOpen').checked = !!cfg.votingOpen;
  $('#cfgPublic').checked = !!cfg.leaderboardPublic;
  $('#cfgPin').value = '';

  $('#publishStatus').textContent = cfg.publishedAt
    ? `Terakhir diterbitkan: ${formatDate(cfg.publishedAt)} · ${adminData.total || 0} suara masuk.`
    : 'Belum ada hasil yang diterbitkan ke publik.';

  const list = adminData?.candidates || [];
  $('#adminPaslonList').innerHTML = list.map((c) => `
    <div class="admin-paslon-row">
      ${avatarHTML(c)}
      <div class="admin-paslon-info">
        <strong>${esc(paslonLabel(c))}</strong>
        <small>${esc(c.kelas || '—')} · ${adminData.tally?.[c.id] || 0} suara</small>
      </div>
      <div class="admin-paslon-actions">
        <button class="btn btn-outline btn-sm" data-edit="${esc(c.id)}">Ubah</button>
        <button class="btn btn-danger btn-sm" data-delete="${esc(c.id)}">Hapus</button>
      </div>
    </div>`).join('') || '<div class="empty">Belum ada paslon.</div>';

  $('#adminLiveRecap').innerHTML = list.map((c) => `
    <div class="recap-row"><span>Paslon ${esc(c.number)}</span><strong>${adminData.tally?.[c.id] || 0} suara</strong></div>`).join('') +
    `<div class="recap-row" style="border:0"><span>Total masuk</span><strong>${adminData.total || 0} suara</strong></div>`;
}

function paslonForm(id = null) {
  const c = id ? (adminData?.candidates || []).find((x) => x.id === id) : null;
  if (id && !c) return;
  openModal(c ? 'Ubah Data Paslon' : 'Tambah Paslon Baru', `
    <form id="paslonForm" class="modal-form" autocomplete="off">
      <input type="hidden" id="candId" value="${esc(c?.id || '')}">
      <div class="form-row">
        <div class="field"><label>Nomor paslon</label><input type="number" id="candNumber" min="1" max="99" value="${esc(c?.number ?? ((adminData?.candidates?.length || 0) + 1))}" required></div>
        <div class="field"><label>Kelas</label><input type="text" id="candKelas" maxlength="40" value="${esc(c?.kelas || '')}" placeholder="Contoh: XI RPL 1"></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Nama Ketua</label><input type="text" id="candKetua" maxlength="100" value="${esc(c?.ketua || '')}" required></div>
        <div class="field"><label>Nama Wakil</label><input type="text" id="candWakil" maxlength="100" value="${esc(c?.wakil || '')}"></div>
      </div>
      <div class="field"><label>Visi</label><textarea id="candVisi" rows="2" maxlength="400">${esc(c?.visi || '')}</textarea></div>
      <div class="field"><label>Misi (satu baris per poin)</label><textarea id="candMisi" rows="3">${esc((c?.misi || []).join('\n'))}</textarea></div>
      <div class="field">
        <label>Foto paslon (opsional, otomatis dikompres untuk HP)</label>
        <input type="hidden" id="candFoto" value="${esc(c?.foto || '')}">
        <div class="foto-upload">
          <img id="fotoPreview" class="foto-preview" src="${esc(c?.foto || '')}" alt="Pratinjau foto paslon">
          <div class="foto-actions">
            <input type="file" id="candFotoFile" accept="image/png,image/jpeg,image/webp">
            <small id="fotoInfo" class="foto-info">${c?.foto ? 'Foto saat ini sudah tersimpan.' : 'Pilih dari galeri/kamera. Maks. 8 MB, akan dikompres otomatis.'}</small>
            <button type="button" class="btn btn-outline btn-sm" id="clearFotoBtn">Hapus foto</button>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-close-modal>Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>`);
}

async function savePaslon() {
  const id = $('#candId').value;
  const body = {
    id,
    number: Number($('#candNumber').value),
    ketua: $('#candKetua').value.trim(),
    wakil: $('#candWakil').value.trim(),
    kelas: $('#candKelas').value.trim(),
    visi: $('#candVisi').value.trim(),
    misi: $('#candMisi').value.split('\n').map((s) => s.trim()).filter(Boolean),
    foto: $('#candFoto').value.trim()
  };
  const ok = await safeAdmin(async () => {
    await api('/api/admin/paslon', { method: 'POST', body });
    closeModal();
    await loadAdmin();
    await loadPublic();
    renderAdmin();
    renderVoting();
    renderResults();
    toast('Data paslon berhasil disimpan.', 'ok');
  });
  return ok;
}

function deletePaslon(id) {
  const c = (adminData?.candidates || []).find((x) => x.id === id);
  if (!c) return;
  openModal('Hapus Paslon?', `
    <p class="confirm-modal-text">Paslon <strong>${esc(paslonLabel(c))}</strong> akan dihapus. Jika paslon sudah memiliki suara, panitia harus mereset suara terlebih dahulu.</p>`,
    `<button class="btn btn-outline" data-close-modal>Batal</button>
     <button class="btn btn-danger" id="doDeletePaslon">Ya, Hapus</button>`);
  $('#doDeletePaslon').onclick = async () => {
    await safeAdmin(async () => {
      await api('/api/admin/paslon?id=' + encodeURIComponent(id), { method: 'DELETE' });
      closeModal();
      await loadAdmin();
      await loadPublic();
      renderAdmin();
      renderVoting();
      renderResults();
      toast('Paslon dihapus.', 'ok');
    });
  };
}

function resetVotes() {
  openModal('Reset Semua Suara?', `
    <p class="confirm-modal-text">Seluruh suara akan dihapus, hasil yang diterbitkan dibatalkan, dan voting dibuka kembali. Tindakan ini tidak dapat dibatalkan.</p>`,
    `<button class="btn btn-outline" data-close-modal>Batal</button>
     <button class="btn btn-danger" id="doResetVotes">Ya, Reset</button>`);
  $('#doResetVotes').onclick = async () => {
    await safeAdmin(async () => {
      await api('/api/admin/reset', { method: 'POST' });
      closeModal();
      sessionStorage.removeItem(RECEIPT_KEY);
      receipt = null;
      justVoted = false;
      draft = null;
      voteStep = 1;
      await loadAdmin();
      await loadPublic();
      renderAdmin();
      renderVoting();
      renderResults();
      toast('Semua suara berhasil direset.', 'ok');
    });
  };
}

async function loadPublic() {
  publicData = await api('/api/state');
}

/* ------------------ Event ------------------ */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-modal]')) return closeModal();
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) return go(goBtn.dataset.go);
  const edit = e.target.closest('[data-edit]');
  if (edit) return paslonForm(edit.dataset.edit);
  const del = e.target.closest('[data-delete]');
  if (del) return deletePaslon(del.dataset.delete);

  if (e.target.id === 'clearFotoBtn') {
    const field = $('#candFoto');
    const preview = $('#fotoPreview');
    const file = $('#candFotoFile');
    const info = $('#fotoInfo');
    if (field) field.value = '';
    if (preview) preview.removeAttribute('src');
    if (file) file.value = '';
    if (info) info.textContent = 'Foto dihapus. Pilih gambar baru jika diperlukan.';
    return;
  }
  if (e.target.id === 'refreshVoteCaptcha' || e.target.id === 'voteCaptcha') {
    return refreshCaptcha('vote').catch(() => toast('Gagal memuat captcha.', 'err'));
  }
  if (e.target.id === 'refreshLoginCaptcha' || e.target.id === 'loginCaptcha') {
    return refreshCaptcha('login').catch(() => toast('Gagal memuat captcha.', 'err'));
  }
  if (e.target.id === 'backVoteBtn') { voteStep = 1; renderVoting(); return; }
  if (e.target.id === 'confirmVoteBtn') return confirmVote();
  if (e.target.id === 'adminLogout') return doLogout();
  if (e.target.id === 'addPaslonBtn') return paslonForm();
  if (e.target.id === 'publishBtn') {
    return safeAdmin(async () => {
      await api('/api/admin/publish', { method: 'POST' });
      await loadAdmin();
      await loadPublic();
      renderAdmin();
      renderResults();
      toast('Hasil leaderboard telah diterbitkan.', 'ok');
    });
  }
  if (e.target.id === 'resetVotesBtn') return resetVotes();
  if (e.target.id === 'retryLoad') return location.reload();
  if (e.target.id === 'exportBtn') {
    return safeAdmin(async () => {
      const response = await fetch('/api/admin/export', { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) throw Object.assign(new Error('Gagal mengekspor data.'), { status: response.status });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pilketos-data.json'; a.click();
      URL.revokeObjectURL(url);
      toast('Data berhasil diekspor.', 'ok');
    });
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'candFotoFile') {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file).then((data) => {
      $('#candFoto').value = data;
      $('#fotoPreview').src = data;
      $('#fotoInfo').textContent = `Foto siap digunakan (${Math.round(data.length / 1024)} KB).`;
      toast('Foto berhasil dikompres dan siap disimpan.', 'ok');
    }).catch((err) => toast(err.message, 'err'));
    return;
  }
  if (e.target.name === 'candidateId') {
    $$('.paslon-card').forEach((card) => card.classList.toggle('selected', $('input', card).checked));
    if (draft) draft.candidateId = e.target.value;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === 'voteForm') return submitVoteStep1(form);
  if (form.id === 'loginForm') return doLogin();
  if (form.id === 'settingsForm') {
    return safeAdmin(async () => {
      await api('/api/admin/settings', {
        method: 'POST',
        body: {
          title: $('#cfgTitle').value.trim(),
          period: $('#cfgPeriod').value.trim(),
          votingOpen: $('#cfgOpen').checked,
          leaderboardPublic: $('#cfgPublic').checked,
          newPin: $('#cfgPin').value.trim()
        }
      });
      $('#cfgPin').value = '';
      await loadAdmin();
      await loadPublic();
      renderAdmin();
      renderVoting();
      renderResults();
      toast('Pengaturan berhasil disimpan.', 'ok');
    });
  }
  if (form.id === 'paslonForm') return savePaslon();
});

$('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modalOverlay').classList.contains('hidden')) closeModal();
});
$('#menuToggle').addEventListener('click', () => {
  const open = $('#mainNav').classList.toggle('open');
  $('#menuToggle').setAttribute('aria-expanded', String(open));
});
$$('.main-nav a').forEach((a) => a.addEventListener('click', () => $('#mainNav').classList.remove('open')));
window.addEventListener('hashchange', renderRoute);

(async function init() {
  $('#year').textContent = new Date().getFullYear();
  captcha.login.input = $('#loginCaptchaInput');
  try {
    await Promise.all([refreshCaptcha('login'), loadPublic()]);
  } catch (err) {
    loadFailed = true;
    toast(err.message || 'Gagal memuat data.', 'err');
    $('#votingContent').innerHTML = `
      <div class="wizard-body">
        <div class="notice notice-warn"><span>!</span><div><strong>Data belum tersedia.</strong> Server voting belum siap atau sedang gangguan. Silakan coba lagi beberapa saat.</div></div>
        <div class="wizard-actions" style="justify-content:center"><button class="btn btn-outline" id="retryLoad">Coba Lagi</button></div>
      </div>`;
  }
  renderRoute();
})();

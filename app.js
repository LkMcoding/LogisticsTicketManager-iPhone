'use strict';

/*
  Logistics Ticket Manager iPhone — beta 0.1
  Nessun server: IndexedDB sul dispositivo + backup manuale JSON.
  I backup SQLite Windows NON sono importabili in questa beta.
*/

const DB_NAME = 'logistics-ticket-manager-iphone';
const STORE = 'app';
const KEY = 'state';
const PORTABLE_FORMAT = 'LTM_PORTABLE';
const PORTABLE_VERSION = 1;

const LABELS = [
  ['Urgente', '#f28c28'],
  ['Inserita denuncia e avvisato Ticketone', '#21734c'],
  ['Ricevuti', '#9dd779'],
  ['Anomalia Ticketone', '#6544a5'],
  ['Addebito Ticketone', '#d65ccb'],
  ['Mail 10 gg lav x ins denuncia', '#e34b50'],
  ['Richiesta denuncia HR', '#55bce8'],
  ['Denuncia da inserire', '#8c929b'],
  ['Mail controlliamo meglio', '#e6c844'],
  ['Tessera', '#299a9b']
];
const COLORS = Object.fromEntries(LABELS);
const $ = selector => document.querySelector(selector);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (globalThis.crypto?.randomUUID?.() || ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
const nowISO = () => new Date().toISOString();
const localISO = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const todayISO = () => localISO(new Date());
const validDate = text => /^\d{4}-\d{2}-\d{2}$/.test(text || '') && !Number.isNaN(new Date(`${text}T12:00:00`).getTime());
const displayDate = text => validDate(text) ? new Intl.DateTimeFormat('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(text+'T12:00:00')) : '—';

function computeEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0);
}
function isItalianNationalHoliday(date) {
  const md = `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if (['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(md)) return true;
  const easter = computeEaster(date.getFullYear());
  easter.setDate(easter.getDate()+1);
  return localISO(easter) === localISO(date);
}
function addWorkingDays(dateText, count = 10) {
  if (!validDate(dateText)) return '';
  const date = new Date(`${dateText}T12:00:00`);
  let passed = 0;
  while (passed < count) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6 && !isItalianNationalHoliday(date)) passed++;
  }
  return localISO(date);
}
function courier(tracking) {
  const code = String(tracking || '').trim().toUpperCase();
  if (!code) return 'Non inserito';
  if (code.startsWith('IT')) return 'AMAZON';
  if (code.startsWith('166')) return 'HR';
  return 'Non riconosciuto';
}
function freshState() {
  return {
    columns: [
      {id: uid(), nome: 'Da lavorare'},
      {id: uid(), nome: 'In lavorazione'},
      {id: uid(), nome: 'In attesa'}
    ],
    tickets: []
  };
}

let db;
let state;
let view = 'board';
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = todayISO();
let toastTimeout;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function readDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
function writeDB(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Scrittura interrotta'));
  });
}
async function mutate(fn) {
  const copy = structuredClone(state);
  fn(copy);
  await writeDB(copy);
  state = copy;
  render();
}
function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.add('hidden'), 3500);
}
function failed(err) {
  console.error(err);
  alert('Impossibile completare l’operazione: ' + (err?.message || String(err)) + '\n\nI dati precedenti non sono stati modificati.');
}

function renderLabels() {
  $('#filter-label').insertAdjacentHTML('beforeend', LABELS.map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(''));
  $('#label-choices').innerHTML = LABELS.map(([name,color]) => `<label class="label-choice"><input type="checkbox" name="labels" value="${escapeHtml(name)}"><span class="label-chip" style="background:${color}">${escapeHtml(name)}</span></label>`).join('');
}
function matchesFilters(ticket) {
  const q = $('#search').value.trim().toLowerCase();
  if (q && ![
    ticket.ordine, ticket.tracking, ticket.email, ticket.note,
    ticket.corriere, ...ticket.etichette
  ].some(value => String(value || '').toLowerCase().includes(q))) return false;
  const status = $('#filter-status').value;
  if (status === 'open' && ticket.completato) return false;
  if (status === 'done' && !ticket.completato) return false;
  const c = $('#filter-courier').value;
  if (c !== 'all' && ticket.corriere !== c) return false;
  const label = $('#filter-label').value;
  if (label !== 'all' && !ticket.etichette.includes(label)) return false;
  return true;
}
function card(ticket) {
  const overdue = ticket.scadenza && !ticket.completato && ticket.scadenza < todayISO();
  const dueToday = ticket.scadenza && !ticket.completato && ticket.scadenza === todayISO();
  const labels = ticket.etichette.map(name => `<span class="label-chip" style="background:${COLORS[name] || '#d6e0e9'}">${escapeHtml(name)}</span>`).join('');
  return `<button class="ticket-card" type="button" data-action="open" data-id="${escapeHtml(ticket.id)}">
    <div class="ticket-top"><span class="ticket-title">Ordine ${escapeHtml(ticket.ordine)}</span>${ticket.completato ? '<span class="status-pill">✓ Concluso</span>' : ''}</div>
    <div class="ticket-info">${ticket.tracking ? `<span>Tracking: ${escapeHtml(ticket.tracking)}</span>` : ''}
      ${ticket.corriere !== 'Non inserito' ? `<span>Corriere: ${escapeHtml(ticket.corriere)}</span>` : ''}
      ${ticket.dataEvento ? `<span>Evento: ${displayDate(ticket.dataEvento)}</span>` : ''}
      ${ticket.scadenza ? `<span>Scadenza: ${displayDate(ticket.scadenza)}</span>` : ''}</div>
    ${(labels || overdue || dueToday) ? `<div class="badge-row">${overdue ? '<span class="due-pill">Scaduto</span>' : ''}${dueToday ? '<span class="due-pill due-today">Scade oggi</span>' : ''}${labels}</div>` : ''}
  </button>`;
}
function renderBoard() {
  $('#board').innerHTML = state.columns.map(column => {
    const total = state.tickets.filter(ticket => ticket.colonnaId === column.id && !ticket.archiviato);
    const visible = total.filter(matchesFilters);
    return `<article class="column" data-column="${escapeHtml(column.id)}">
      <div class="column-head"><strong>${escapeHtml(column.nome)}</strong><span class="col-count">${visible.length}${visible.length !== total.length ? `/${total.length}` : ''}</span><button class="col-menu" type="button" data-action="rename-column" data-id="${escapeHtml(column.id)}" title="Rinomina colonna">✎</button><button class="col-menu" type="button" data-action="delete-column" data-id="${escapeHtml(column.id)}" title="Elimina colonna vuota">×</button></div>
      <div class="ticket-list">${visible.length ? visible.map(card).join('') : `<div class="empty-in-column">${total.length ? 'Nessun ticket corrisponde ai filtri.' : 'Nessun ticket in questa colonna.'}</div>`}</div>
      <div class="column-foot"><button type="button" class="button secondary small" data-action="new-in-column" data-id="${escapeHtml(column.id)}">+ Nuovo ticket</button></div>
    </article>`;
  }).join('');
}
function renderArchive() {
  const archived = state.tickets.filter(ticket => ticket.archiviato && matchesFilters(ticket));
  $('#archive-list').innerHTML = archived.length ? archived.map(card).join('') : '<div class="empty-state">Nessun ticket archiviato corrisponde alla ricerca.</div>';
  $('#archive-count').textContent = state.tickets.filter(ticket => ticket.archiviato).length;
}
function calendarEventsFor(date) {
  return state.tickets.filter(t => !t.archiviato && (t.scadenza === date || t.dataEvento === date));
}
function renderCalendar() {
  $('#calendar-title').textContent = new Intl.DateTimeFormat('it-IT', {month:'long',year:'numeric'}).format(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay()+6) % 7;
  const heads = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d => `<div class="calendar-weekday">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div aria-hidden="true"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const date = localISO(new Date(month.getFullYear(), month.getMonth(), day));
    const events = calendarEventsFor(date);
    const due = events.some(t => t.scadenza === date);
    const evt = events.some(t => t.dataEvento === date);
    cells += `<button type="button" class="calendar-cell ${date===selectedDate?'selected':''} ${date===todayISO()?'today':''}" data-action="select-day" data-date="${date}" aria-label="${day}, ${events.length} ticket"><span class="calendar-day">${day}</span><span class="calendar-events">${due ? '<span class="calendar-dot"></span>' : ''}${evt ? '<span class="calendar-dot event"></span>' : ''}${events.length ? events.length : ''}</span></button>`;
  }
  $('#calendar-grid').innerHTML = heads + cells;
  const events = calendarEventsFor(selectedDate);
  $('#calendar-day-list').innerHTML = `<h3>${displayDate(selectedDate)} · ${events.length} ticket</h3>` + (events.length ? events.map(t => `<button class="calendar-item" data-action="open" data-id="${escapeHtml(t.id)}"><strong>Ordine ${escapeHtml(t.ordine)}</strong><small>${[t.scadenza===selectedDate?'Scadenza':'', t.dataEvento===selectedDate?'Evento':''].filter(Boolean).join(' · ')}</small></button>`).join('') : '<div class="empty-state">Nessun evento o scadenza in questa data.</div>');
}
function render() {
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('selected', el.dataset.view === view));
  $('#view-board').classList.toggle('hidden', view !== 'board');
  $('#view-calendar').classList.toggle('hidden', view !== 'calendar');
  $('#view-archive').classList.toggle('hidden', view !== 'archive');
  renderBoard(); renderArchive(); renderCalendar();
}
function ticketById(id) { return state.tickets.find(t => t.id === id); }
function openTicket(id = null, columnId = null) {
  const ticket = id ? ticketById(id) : null;
  if (id && !ticket) return toast('Ticket non trovato');
  $('#dialog-title').textContent = ticket ? `Ordine ${ticket.ordine}` : 'Nuovo ticket';
  $('#ticket-id').value = ticket?.id || '';
  $('#field-column').innerHTML = state.columns.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)}</option>`).join('');
  $('#field-column').value = ticket?.colonnaId || columnId || state.columns[0].id;
  $('#field-order').value = ticket?.ordine || '';
  $('#field-tracking').value = ticket?.tracking || '';
  $('#field-event').value = ticket?.dataEvento || '';
  $('#field-insert').value = ticket?.dataInserimento || todayISO();
  $('#field-email').value = ticket?.email || '';
  $('#field-due').value = ticket?.scadenza || '';
  $('#field-notes').value = ticket?.note || '';
  $('#field-ten-days').checked = false;
  $('#field-completed').checked = Boolean(ticket?.completato);
  document.querySelectorAll('input[name="labels"]').forEach(box => { box.checked = Boolean(ticket?.etichette.includes(box.value)); });
  $('#courier-display').textContent = `Corriere: ${courier($('#field-tracking').value)}`;
  const archived = Boolean(ticket?.archiviato);
  $('#save-ticket').classList.toggle('hidden', archived);
  $('#archive-action').classList.toggle('hidden', !ticket || archived);
  $('#archive-action').disabled = ticket ? !ticket.completato : true;
  $('#archive-action').title = ticket && !ticket.completato ? 'Concludi il ticket prima di archiviarlo' : 'Archivia ticket';
  $('#restore-action').classList.toggle('hidden', !archived);
  $('#comments-section').classList.toggle('hidden', !ticket);
  $('#ticket-form').querySelectorAll('input,textarea,select').forEach(control => { if (control.id !== 'ticket-id') control.disabled = archived && control.id !== 'comment-text'; });
  $('#add-comment').disabled = archived;
  $('#comments-list').innerHTML = ticket?.commenti.length ? ticket.commenti.map(c => `<div class="comment-item">${escapeHtml(c.testo)}<small>${escapeHtml(c.autore || 'iPhone')} · ${new Date(c.creatoIl).toLocaleString('it-IT')}</small></div>`).join('') : '<p class="version">Nessun commento.</p>';
  $('#comment-text').value = '';
  $('#ticket-dialog').showModal();
}
function readForm() {
  const id = $('#ticket-id').value || uid();
  const original = ticketById(id);
  const ordine = $('#field-order').value.trim();
  if (!ordine) throw new Error('Inserisci il numero ordine.');
  const dataInserimento = $('#field-insert').value || todayISO();
  return {
    id,
    ordine,
    colonnaId: $('#field-column').value,
    tracking: $('#field-tracking').value.trim(),
    corriere: courier($('#field-tracking').value),
    dataEvento: $('#field-event').value,
    dataInserimento,
    scadenza: $('#field-due').value,
    email: $('#field-email').value.trim(),
    note: $('#field-notes').value.trim(),
    etichette: Array.from(document.querySelectorAll('input[name="labels"]:checked')).map(box => box.value),
    completato: $('#field-completed').checked,
    archiviato: false,
    commenti: original?.commenti || [],
    creatoIl: original?.creatoIl || nowISO(),
    modificatoIl: nowISO()
  };
}
function normalizePortable(root) {
  if (!root || root.formato !== PORTABLE_FORMAT || root.versioneFormato !== PORTABLE_VERSION || !root.dati) throw new Error('Formato non supportato. Serve un backup JSON LTM_PORTABLE v1, non il backup SQLite Windows.');
  const data = root.dati;
  if (!Array.isArray(data.colonne) || !Array.isArray(data.tickets) || data.colonne.length > 500 || data.tickets.length > 50000 || !data.colonne.length) throw new Error('Contenuto del backup non valido o troppo grande.');
  const columns = data.colonne.map(c => {
    if (!c || typeof c.id !== 'string' || typeof c.nome !== 'string' || !c.id || !c.nome.trim()) throw new Error('Colonna non valida.');
    return {id:c.id.slice(0,120), nome:c.nome.slice(0,100)};
  });
  const columnIds = new Set(columns.map(c => c.id));
  if (columnIds.size !== columns.length) throw new Error('ID colonne duplicati.');
  const tickets = data.tickets.map(t => {
    if (!t || typeof t.id !== 'string' || typeof t.ordine !== 'string' || !t.ordine.trim() || !columnIds.has(t.colonnaId)) throw new Error('Ticket o colonna non valida.');
    const str = (k,n=5000) => typeof t[k] === 'string' ? t[k].slice(0,n) : '';
    return {
      id:t.id.slice(0,120), ordine:str('ordine',100), colonnaId:t.colonnaId,
      tracking:str('tracking',200), corriere:courier(t.tracking),
      dataEvento: validDate(t.dataEvento) ? t.dataEvento : '',
      dataInserimento:validDate(t.dataInserimento) ? t.dataInserimento : todayISO(),
      scadenza:validDate(t.scadenza) ? t.scadenza : '',
      email:str('email',240),note:str('note',10000),
      etichette:Array.isArray(t.etichette) ? t.etichette.filter(name => typeof name==='string' && Object.hasOwn(COLORS,name)).slice(0,10) : [],
      completato:Boolean(t.completato),archiviato:Boolean(t.archiviato),
      commenti:Array.isArray(t.commenti) ? t.commenti.slice(0,5000).filter(c=>c&&typeof c.testo==='string').map(c=>({id:typeof c.id==='string'?c.id:uid(),testo:c.testo.slice(0,1000),autore:typeof c.autore==='string'?c.autore.slice(0,100):'iPhone',creatoIl:typeof c.creatoIl==='string'?c.creatoIl:nowISO()})) : [],
      creatoIl:str('creatoIl',50)||nowISO(), modificatoIl:str('modificatoIl',50)||nowISO()
    };
  });
  if (new Set(tickets.map(t=>t.id)).size !== tickets.length) throw new Error('ID ticket duplicati.');
  return {columns, tickets};
}
function exportBackup() {
  const out = {
    formato:PORTABLE_FORMAT,
    versioneFormato:PORTABLE_VERSION,
    origine:'iPhone-PWA',
    esportatoIl:nowISO(),
    dati:{colonne:state.columns, tickets:state.tickets}
  };
  const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`LogisticsTickets_iPhone_${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  toast('Backup creato: salvalo in File, fuori dall’app.');
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) throw new Error('Il backup supera il limite di 15 MB.');
  const parsed = JSON.parse(await file.text());
  const imported = normalizePortable(parsed);
  const summary = `Importare ${imported.tickets.length} ticket e ${imported.columns.length} colonne?\n\nATTENZIONE: tutti i ticket e le colonne ATTUALI su questo iPhone saranno sostituiti.\n\nPrima esporta un backup dei dati esistenti.`;
  if (!confirm(summary)) return;
  await writeDB(imported);
  state = imported;
  view = 'board';
  render();
  toast('Importazione completata.');
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  if (action === 'open') { openTicket(id); return; }
  if (action === 'new-in-column') { openTicket(null,id); return; }
  if (action === 'select-day') { selectedDate=element.dataset.date;renderCalendar();return; }
  if (action === 'rename-column') {
    const col=state.columns.find(c=>c.id===id);
    if (!col) return;
    const name=prompt('Nuovo nome della colonna:', col.nome);
    if (!name || !name.trim()) return;
    await mutate(s=>{s.columns.find(c=>c.id===id).nome=name.trim().slice(0,100);});
  }
  if (action === 'delete-column') {
    if (state.columns.length <= 1) return toast('Deve rimanere almeno una colonna.');
    if (state.tickets.some(t=>t.colonnaId===id)) return toast('Impossibile eliminare: colonna associata a ticket, anche archiviati.');
    if (!confirm('Eliminare la colonna vuota?')) return;
    await mutate(s=>{s.columns=s.columns.filter(c=>c.id!==id);});
  }
}
function setupHandlers() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {view=button.dataset.view;render();}));
  ['#search','#filter-status','#filter-courier','#filter-label'].forEach(selector => $(selector).addEventListener(selector==='#search'?'input':'change',render));
  $('#board').addEventListener('click', e => { const button=e.target.closest('[data-action]'); if(button) handleAction(button.dataset.action,button).catch(failed); });
  $('#archive-list').addEventListener('click',e => {const button=e.target.closest('[data-action]');if(button)handleAction(button.dataset.action,button).catch(failed);});
  $('#calendar-grid').addEventListener('click',e => {const button=e.target.closest('[data-action]');if(button)handleAction(button.dataset.action,button).catch(failed);});
  $('#calendar-day-list').addEventListener('click',e => {const button=e.target.closest('[data-action]');if(button)handleAction(button.dataset.action,button).catch(failed);});
  $('#new-ticket').addEventListener('click',()=>openTicket());
  $('#new-column').addEventListener('click',async()=>{const name=prompt('Nome nuova colonna:');if(!name?.trim())return;try{await mutate(s=>s.columns.push({id:uid(),nome:name.trim().slice(0,100)}));toast('Colonna aggiunta.');}catch(e){failed(e);}});
  $('#close-dialog').addEventListener('click',()=>$('#ticket-dialog').close());
  $('#field-tracking').addEventListener('input',()=>{$('#courier-display').textContent='Corriere: '+courier($('#field-tracking').value);});
  $('#field-ten-days').addEventListener('change',()=>{if($('#field-ten-days').checked)$('#field-due').value=addWorkingDays($('#field-insert').value);});
  $('#field-insert').addEventListener('change',()=>{if($('#field-ten-days').checked)$('#field-due').value=addWorkingDays($('#field-insert').value);});
  $('#ticket-form').addEventListener('submit',async e=>{
    e.preventDefault();
    try {
      const ticket=readForm();
      if(state.tickets.some(t=>t.ordine.toLowerCase()===ticket.ordine.toLowerCase() && t.id!==ticket.id)) {
        if(!confirm('Esiste già un ticket con questo numero ordine. Vuoi salvare comunque?'))return;
      }
      await mutate(s=>{const idx=s.tickets.findIndex(t=>t.id===ticket.id);if(idx>=0)s.tickets[idx]=ticket;else s.tickets.push(ticket);});
      $('#ticket-dialog').close();toast('Ticket salvato sul dispositivo.');
    } catch(err) {failed(err);}
  });
  $('#archive-action').addEventListener('click',async()=>{
    const id=$('#ticket-id').value,t=ticketById(id);
    if(!t?.completato)return toast('Ticket non concluso, impossibile archiviare.');
    if(!confirm(`Archiviare l’ordine ${t.ordine}?`))return;
    try{await mutate(s=>{s.tickets.find(x=>x.id===id).archiviato=true;});$('#ticket-dialog').close();toast('Ticket archiviato.');}catch(e){failed(e);}
  });
  $('#restore-action').addEventListener('click',async()=>{
    const id=$('#ticket-id').value;
    try{await mutate(s=>{s.tickets.find(x=>x.id===id).archiviato=false;});$('#ticket-dialog').close();view='board';render();toast('Ticket ripristinato.');}catch(e){failed(e);}
  });
  $('#add-comment').addEventListener('click',async()=>{
    const id=$('#ticket-id').value,text=$('#comment-text').value.trim();
    if(!id||!text)return;
    try{await mutate(s=>{s.tickets.find(t=>t.id===id).commenti.push({id:uid(),testo:text.slice(0,1000),autore:'iPhone',creatoIl:nowISO()});});openTicketInPlace(id);toast('Commento salvato.');}catch(e){failed(e);}
  });
  $('#backup-export').addEventListener('click',exportBackup);
  $('#backup-import').addEventListener('change',async e=>{const file=e.target.files[0];try{await importBackup(file);}catch(err){failed(err);}finally{e.target.value='';}});
  $('#calendar-prev').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);selectedDate=localISO(month);renderCalendar();});
  $('#calendar-next').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);selectedDate=localISO(month);renderCalendar();});
  $('#calendar-today').addEventListener('click',()=>{month=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectedDate=todayISO();renderCalendar();});
}
function openTicketInPlace(id){
  $('#ticket-dialog').close();
  openTicket(id);
}
async function main(){
  renderLabels();
  try {
    db=await openDB();
    state=await readDB();
    if(!state){state=freshState();await writeDB(state);}
    if(!Array.isArray(state.columns)||!state.columns.length||!Array.isArray(state.tickets))throw new Error('Archivio locale non valido.');
    setupHandlers();render();
    if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')) navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Offline non attivo:',err));
  } catch(err){console.error(err);alert('ERRORE DI ARCHIVIAZIONE LOCALE. Non è possibile avviare il gestionale in sicurezza.\n\n'+err.message);}
}
main();

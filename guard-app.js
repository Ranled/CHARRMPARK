/**
 * CHARRMPARK - Guard Dashboard Logic
 */
initSupabase();
startClock();
updateDBBadge();

// State
let appState = {
    totalVehicles: 0, entriesToday: 0, exitsToday: 0,
    availableSlots: 0, totalSlots: 10,
    parkingSlots: [], recentScans: [], users: []
};

// Demo users
const mockUsersList = [
    { uid:'B7 78 96 31', name:'Juan Dela Cruz', role:'Student', program:'BSIT', section:'3A', type:'Car', model:'Honda Civic', plate:'XYZ-123', color:'Black', status:'AUTHORIZED' },
    { uid:'UID67890', name:'Maria Santos', role:'Faculty', program:'Engineering', section:'--', type:'SUV', model:'Toyota Fortuner', plate:'ABC-789', color:'White', status:'AUTHORIZED' },
    { uid:'UID55555', name:'Carlos Reyes', role:'Staff', program:'Admin', section:'--', type:'Motorcycle', model:'Yamaha NMAX', plate:'DEF-456', color:'Silver', status:'AUTHORIZED' },
];
const mockUsers = {};
mockUsersList.forEach(u => mockUsers[u.uid] = u);

// Generate slots
function generateSlots() {
    const slots = [];
    for (let i = 1; i <= 10; i++) {
        const r = Math.random();
        slots.push({ id: `TM${i}`, slot_number: `TM${String(i).padStart(2,'0')}`, status: r > 0.6 ? 'OCCUPIED' : 'AVAILABLE' });
    }
    return slots;
}

// Init state
async function initState() {
    if (isConnected) {
        try {
            const { data: users } = await supabase.from('users').select('*');
            if (users) { appState.users = users; appState.totalVehicles = users.length; }
            const { data: slots } = await supabase.from('parking_slots').select('*');
            if (slots && slots.length) appState.parkingSlots = slots;
            else appState.parkingSlots = generateSlots();
            const { data: logs } = await supabase.from('parking_logs').select('*, users(full_name)').order('timestamp', { ascending: false }).limit(20);
            if (logs) appState.recentScans = logs.map(l => ({ uid: l.rfid_uid, name: l.users?.full_name || 'Unknown', status: l.status, event: l.scan_type, slot: l.parking_slot || '--', time: new Date(l.timestamp).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'}) }));
        } catch(e) { console.error(e); appState.parkingSlots = generateSlots(); }
    } else {
        appState.parkingSlots = generateSlots();
        appState.users = mockUsersList;
        appState.totalVehicles = mockUsersList.length + 100;
        for (let i = 0; i < 8; i++) {
            const u = mockUsersList[i % 3];
            appState.recentScans.push({ uid: u.uid, name: u.name, status: u.status, event: i%2===0?'ENTRY':'EXIT', slot: i%2===0?`TM${(i%5)+1}`:'--', time: new Date(Date.now()-i*900000).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'}) });
        }
        appState.entriesToday = 42; appState.exitsToday = 18;
    }
    renderAll();
}

// View switching
function switchView(view) {
    document.querySelectorAll('.app-view').forEach(v => { v.classList.add('hidden'); v.classList.remove('flex'); });
    const target = document.getElementById('view-' + view);
    if (target) { target.classList.remove('hidden'); target.classList.add('flex'); }
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const nav = document.getElementById('nav-' + view);
    if (nav) nav.classList.add('active');
    renderAll();
}
window.switchView = switchView;

// Render
function renderAll() {
    const occ = appState.parkingSlots.filter(s => s.status === 'OCCUPIED').length;
    appState.availableSlots = appState.parkingSlots.length - occ;

    const el = (id) => document.getElementById(id);
    if(el('statTotal')) el('statTotal').textContent = appState.totalVehicles || appState.users.length;
    if(el('statEntries')) el('statEntries').textContent = appState.entriesToday;
    if(el('statExits')) el('statExits').textContent = appState.exitsToday;
    if(el('statAvailable')) el('statAvailable').textContent = `${appState.availableSlots} / ${appState.parkingSlots.length}`;
    if(el('miniAvail')) el('miniAvail').textContent = appState.availableSlots;
    if(el('miniOccup')) el('miniOccup').textContent = occ;
    if(el('gridAvail')) el('gridAvail').textContent = appState.availableSlots;
    if(el('gridOccup')) el('gridOccup').textContent = occ;

    // Slots
    const renderSlots = (containerId) => {
        const c = el(containerId);
        if (!c) return;
        c.innerHTML = appState.parkingSlots.map(s => {
            const a = s.status === 'AVAILABLE', o = s.status === 'OCCUPIED';
            const bg = a ? 'bg-charm-light/20 border-charm-light/40 text-charm-dark' : o ? 'bg-red-50 border-red-200 text-red-600' : 'bg-yellow-50 border-yellow-200 text-yellow-700';
            const dot = a ? 'bg-charm-green' : o ? 'bg-red-500' : 'bg-yellow-400';
            return `<div class="rounded-xl p-3 border ${bg} flex flex-col items-center justify-center slot-card"><div class="w-full flex justify-end mb-1"><div class="w-2 h-2 rounded-full ${dot}"></div></div><div class="text-lg font-display font-bold">${s.slot_number}</div><div class="text-[10px] font-bold uppercase mt-1">${s.status}</div></div>`;
        }).join('');
    };
    renderSlots('parkingSlotsContainer');
    renderSlots('liveScanSlots');
    renderSlots('monitorSlotsContainer');

    // Activity table
    if (el('dashActivityTable')) {
        el('dashActivityTable').innerHTML = appState.recentScans.slice(0,7).map(s => `<tr class="hover:bg-white/60 transition-colors border-b border-slate-100/50"><td class="p-4 text-slate-500">${s.time}</td><td class="p-4"><div class="font-bold text-slate-800">${s.name}</div><div class="text-[10px] text-slate-400 font-mono">${s.uid}</div></td><td class="p-4 font-bold text-slate-700">${s.slot||'--'}</td><td class="p-4 text-right"><span class="px-2 py-1 rounded text-[10px] font-bold ${s.event==='ENTRY'?'bg-green-100 text-green-700':s.event==='EXIT'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-700'}">${s.event||s.status}</span></td></tr>`).join('');
    }
    if (el('logsTable')) {
        el('logsTable').innerHTML = appState.recentScans.map(s => `<tr class="hover:bg-white/60 border-b border-slate-100/50"><td class="p-4 text-slate-500">${s.time}</td><td class="p-4 text-xs font-mono text-slate-400">${s.uid}</td><td class="p-4 font-bold text-slate-800">${s.name}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${s.event==='ENTRY'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${s.event||s.status}</span></td><td class="p-4 font-bold">${s.slot||'--'}</td><td class="p-4 text-right"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.status==='AUTHORIZED'?'text-green-600 border border-green-200':'text-red-600 border border-red-200'}">●</span></td></tr>`).join('');
    }

    // Recent scans sidebar
    if (el('recentScansContainer') && appState.recentScans.length > 0) {
        el('recentScansContainer').innerHTML = appState.recentScans.slice(0,10).map(s => `<div class="bg-white/60 p-3 rounded-xl border border-white shadow-sm flex items-center gap-3"><div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${s.status==='AUTHORIZED'?'bg-green-100 text-green-600':'bg-red-100 text-red-600'}"><i data-lucide="${s.status==='AUTHORIZED'?'check':'x'}" class="w-4 h-4"></i></div><div class="flex-1 overflow-hidden"><div class="flex justify-between items-center mb-0.5"><span class="font-bold text-sm text-slate-800 truncate">${s.name}</span><span class="text-[10px] font-bold text-slate-400">${s.time}</span></div><div class="flex items-center gap-2"><span class="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 rounded">${s.uid.substring(0,10)}</span><span class="text-[10px] font-bold uppercase ${s.status==='AUTHORIZED'?'text-green-600':'text-red-600'}">${s.event||s.status}</span></div></div></div>`).join('');
    }
    lucide.createIcons();
}

// RFID Scan
function processRFIDScan(uid) {
    if (!uid) return;
    switchView('livescan');
    document.getElementById('radarContainer').classList.add('scanning');
    document.getElementById('scanStatusText').textContent = 'VERIFYING...';
    document.getElementById('scanSubtext').textContent = `UID: ${uid}`;
    document.getElementById('radarCenter').innerHTML = '<i data-lucide="loader-2" id="radarIcon" class="w-10 h-10 text-slate-400 animate-spin"></i>';
    lucide.createIcons();
    document.getElementById('scanResultEmpty').classList.add('hidden');
    const resData = document.getElementById('scanResultData');
    resData.classList.remove('hidden'); resData.classList.add('opacity-50');

    setTimeout(() => {
        document.getElementById('radarContainer').classList.remove('scanning');
        resData.classList.remove('opacity-50');
        let result = mockUsers[uid] ? {...mockUsers[uid]} : { uid, name:'Unknown', role:'--', program:'--', type:'--', model:'--', plate:'--', color:'--', status:'UNAUTHORIZED' };
        const isAuth = result.status === 'AUTHORIZED';
        const panel = document.getElementById('radarContainer').parentElement;

        if (isAuth) {
            panel.classList.add('status-authorized'); panel.classList.remove('status-denied');
            document.getElementById('scanStatusText').textContent = 'AUTHORIZED';
            document.getElementById('scanStatusText').className = 'text-xl font-bold font-display text-green-600 mb-2';
            document.getElementById('scanSubtext').textContent = 'Access Granted.';
            document.getElementById('radarCenter').innerHTML = '<i data-lucide="check" id="radarIcon" class="w-10 h-10 text-white"></i>';
            document.getElementById('resStatusLabel').className = 'px-4 py-2 rounded-xl font-bold text-sm tracking-wide shadow-sm border bg-green-50 border-green-200 text-green-700';
            document.getElementById('resStatusLabel').innerHTML = '✓ ENTRY GRANTED';
            document.getElementById('resBadge').className = 'absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white text-white shadow-md bg-green-500';
            const freeSlot = appState.parkingSlots.find(s => s.status === 'AVAILABLE');
            if (freeSlot) {
                document.getElementById('resSlotNotice').classList.remove('hidden');
                document.getElementById('resSlotId').textContent = freeSlot.slot_number;
                freeSlot.status = 'OCCUPIED'; appState.entriesToday++; result.event = 'ENTRY'; result.slot = freeSlot.slot_number;
            } else { document.getElementById('resSlotNotice').classList.add('hidden'); }
        } else {
            panel.classList.add('status-denied'); panel.classList.remove('status-authorized');
            document.getElementById('scanStatusText').textContent = 'DENIED';
            document.getElementById('scanStatusText').className = 'text-xl font-bold font-display text-red-600 mb-2';
            document.getElementById('scanSubtext').textContent = 'Invalid RFID.';
            document.getElementById('radarCenter').innerHTML = '<i data-lucide="x" id="radarIcon" class="w-10 h-10 text-white"></i>';
            document.getElementById('resStatusLabel').className = 'px-4 py-2 rounded-xl font-bold text-sm tracking-wide shadow-sm border bg-red-50 border-red-200 text-red-700';
            document.getElementById('resStatusLabel').innerHTML = '✗ ACCESS DENIED';
            document.getElementById('resBadge').className = 'absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white text-white shadow-md bg-red-500';
            document.getElementById('resSlotNotice').classList.add('hidden');
            result.event = 'DENIED';
        }

        document.getElementById('resProfileImage').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.name)}&background=random&color=fff&size=200`;
        document.getElementById('resName').textContent = result.name;
        document.getElementById('resRole').textContent = result.role;
        document.getElementById('resProgram').textContent = result.program || '--';
        document.getElementById('resUid').textContent = result.uid;
        document.getElementById('resVehType').textContent = result.type;
        document.getElementById('resPlate').textContent = result.plate;
        document.getElementById('resVehModel').textContent = result.model;
        document.getElementById('resColor').textContent = result.color;

        result.time = new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit'});
        appState.recentScans.unshift(result);
        lucide.createIcons(); renderAll();

        setTimeout(() => {
            panel.classList.remove('status-authorized','status-denied');
            document.getElementById('scanStatusText').textContent = 'READY';
            document.getElementById('scanStatusText').className = 'text-xl font-bold font-display text-slate-600 mb-2';
            document.getElementById('scanSubtext').textContent = 'Place card near reader.';
            document.getElementById('radarCenter').innerHTML = '<i data-lucide="nfc" id="radarIcon" class="w-10 h-10 text-slate-400"></i>';
            lucide.createIcons();
        }, 5000);
    }, 1200);
}

// Tab switching
const tabSR = document.getElementById('tabScanResult'), tabPG = document.getElementById('tabParkingGrid');
const viewSR = document.getElementById('viewScanResult'), viewPG = document.getElementById('viewParkingGrid');
if (tabSR && tabPG) {
    tabSR.addEventListener('click', () => { tabSR.classList.add('text-charm-dark','border-b-2','border-charm-dark'); tabSR.classList.remove('text-slate-400'); tabPG.classList.remove('text-charm-dark','border-b-2','border-charm-dark'); tabPG.classList.add('text-slate-400'); viewSR.classList.remove('hidden'); viewSR.classList.add('flex'); viewPG.classList.add('hidden'); viewPG.classList.remove('flex'); });
    tabPG.addEventListener('click', () => { tabPG.classList.add('text-charm-dark','border-b-2','border-charm-dark'); tabPG.classList.remove('text-slate-400'); tabSR.classList.remove('text-charm-dark','border-b-2','border-charm-dark'); tabSR.classList.add('text-slate-400'); viewPG.classList.remove('hidden'); viewPG.classList.add('flex'); viewSR.classList.add('hidden'); viewSR.classList.remove('flex'); renderAll(); });
}

// Buttons
document.getElementById('btnDemoScan')?.addEventListener('click', () => { const uid = document.getElementById('demoUidInput').value.trim() || 'B7 78 96 31'; processRFIDScan(uid); document.getElementById('demoUidInput').value = ''; });
document.getElementById('btnAllow')?.addEventListener('click', () => { showToast('Manual Override: Entry Allowed.','success'); document.getElementById('scanResultData').classList.add('hidden'); document.getElementById('scanResultEmpty').classList.remove('hidden'); });
document.getElementById('btnDeny')?.addEventListener('click', () => { showToast('Manual Override: Entry Denied.','warning'); document.getElementById('scanResultData').classList.add('hidden'); document.getElementById('scanResultEmpty').classList.remove('hidden'); });

// Supabase Realtime
if (isConnected) {
    supabase.channel('public:parking_logs').on('postgres_changes',{event:'INSERT',schema:'public',table:'parking_logs'}, p => processRFIDScan(p.new.rfid_uid)).subscribe();
    supabase.channel('public:parking_slots').on('postgres_changes',{event:'UPDATE',schema:'public',table:'parking_slots'}, p => { const i = appState.parkingSlots.findIndex(s=>s.id===p.new.id); if(i!==-1){appState.parkingSlots[i]=p.new; renderAll();} }).subscribe();
}

initState();
lucide.createIcons();

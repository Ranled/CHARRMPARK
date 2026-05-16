/**
 * CHARRMPARK - Admin Dashboard Logic
 * User management, RFID UID assignment, analytics, and real-time updates
 */
initSupabase(); startClock(); updateDBBadge();
const el = id => document.getElementById(id);

let adminState = { users: [], pendingUsers: [], logs: [], slots: [], accounts: [] };

// Demo data (fallback)
const demoUsers = [
    { id:'1', full_name:'Juan Dela Cruz', role:'Student', rfid_uid:'B7 78 96 31', program:'BSIT', section:'3A', vehicle_type:'Car', vehicle_model:'Honda Civic', plate_number:'XYZ-123', vehicle_color:'Black', authorization_status:'AUTHORIZED', age:21, sex:'Male', address:'Ibajay, Aklan', created_at:'2024-01-15' },
    { id:'2', full_name:'Maria Santos', role:'Faculty', rfid_uid:'UID67890', program:'Engineering', section:'--', vehicle_type:'SUV', vehicle_model:'Toyota Fortuner', plate_number:'ABC-789', vehicle_color:'White', authorization_status:'AUTHORIZED', age:35, sex:'Female', address:'Kalibo, Aklan', created_at:'2024-02-01' },
    { id:'3', full_name:'Carlos Reyes', role:'Staff', rfid_uid:'UID55555', program:'Admin', section:'--', vehicle_type:'Motorcycle', vehicle_model:'Yamaha NMAX', plate_number:'DEF-456', vehicle_color:'Silver', authorization_status:'AUTHORIZED', age:28, sex:'Male', address:'Nabas, Aklan', created_at:'2024-03-10' },
    { id:'4', full_name:'Ana Lopez', role:'Student', rfid_uid:'', program:'BSCS', section:'2B', vehicle_type:'Motorcycle', vehicle_model:'Honda Click', plate_number:'GHI-789', vehicle_color:'Red', authorization_status:'PENDING', age:20, sex:'Female', address:'Ibajay, Aklan', created_at:'2024-05-13' },
    { id:'5', full_name:'Pedro Garcia', role:'Student', rfid_uid:'', program:'BSA', section:'1A', vehicle_type:'Car', vehicle_model:'Vios', plate_number:'JKL-012', vehicle_color:'Blue', authorization_status:'PENDING', age:19, sex:'Male', address:'Tangalan, Aklan', created_at:'2024-05-14' },
];

function generateSlots() {
    const s = [];
    for (let i=1;i<=10;i++) s.push({ id:`TM${i}`, slot_number:`TM${String(i).padStart(2,'0')}`, status: 'AVAILABLE', slot_row: 'TM' });
    return s;
}

// =====================
// VIEW SWITCHING
// =====================
function adminView(v) {
    document.querySelectorAll('.app-view').forEach(el=>{el.classList.add('hidden');el.classList.remove('flex');});
    const t = document.getElementById('aview-'+v);
    if(t){t.classList.remove('hidden');t.classList.add('flex');}
    document.querySelectorAll('.sidebar-item').forEach(s=>s.classList.remove('active'));
    const n = document.getElementById('anav-'+v);
    if(n) n.classList.add('active');
    if(v==='analytics') initCharts();
    renderAdmin();
}
window.adminView = adminView;

function renderSlotsManagement() {
    const table = el('slotManagementTable');
    if (!table) return;

    if (!adminState.slots.length) {
        table.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">No parking slots found</td></tr>';
        return;
    }

    const sorted = [...adminState.slots].sort((a, b) => a.slot_number.localeCompare(b.slot_number, undefined, {numeric: true, sensitivity: 'base'}));

    table.innerHTML = sorted.map(s => {
        const isOccupied = s.status === 'OCCUPIED';
        const statusClass = s.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' : s.status === 'OCCUPIED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';
        
        return `
            <tr class="hover:bg-white/60 border-b border-slate-100/50 transition-colors">
                <td class="p-4"><div class="font-bold text-slate-800">${s.slot_number}</div></td>
                <td class="p-4 text-slate-500">${s.slot_row || '--'}</td>
                <td class="p-4 text-center"><span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusClass}">${s.status}</span></td>
                <td class="p-4 text-right whitespace-nowrap">
                    <button onclick="editSlot('${s.id}')" class="p-2 text-slate-400 hover:text-charm-dark transition-colors" title="Edit Slot"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="deleteSlot('${s.id}', '${s.status}')" class="p-2 text-slate-400 hover:text-red-500 transition-colors ${isOccupied ? 'opacity-30 cursor-not-allowed' : ''}" title="${isOccupied ? 'Cannot delete occupied slot' : 'Delete Slot'}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// =====================
// LOAD DATA
// =====================
async function loadData() {
    if (isConnected) {
        try {
            const {data:u, error:ue} = await supabaseClient.from('users').select('*').order('created_at',{ascending:false});
            if (ue) { console.error('Users error:', ue); throw ue; }
            if(u) adminState.users = u;

            const {data:s, error:se} = await supabaseClient.from('parking_slots').select('*');
            if (se) console.error('Slots error:', se);
            
            // If the database has ANY slots, use them. 
            // If it's totally empty, try to seed it with the 10 TM slots.
            if (s && s.length > 0) {
                adminState.slots = s;
                console.log(`📡 Loaded ${s.length} real slots from DB.`);
            } else {
                console.log('⚠️ No slots in DB. Attempting to seed initial 10 slots...');
                const seed = generateSlots();
                const { error: seedErr } = await supabaseClient.from('parking_slots').insert(seed);
                if (!seedErr) {
                    console.log('✅ Successfully seeded DB with initial slots.');
                    const { data: fresh } = await supabaseClient.from('parking_slots').select('*');
                    adminState.slots = fresh || seed;
                } else {
                    console.warn('❌ Seed failed (possibly already seeded by another tab):', seedErr);
                    adminState.slots = seed;
                }
            }

            const {data:l, error:le} = await supabaseClient.from('parking_logs')
                .select('*, users(full_name, role, program, section, vehicle_type, vehicle_model, plate_number, vehicle_color, profile_image, motorcycle_image)')
                .order('timestamp',{ascending:false}).limit(1000);
            if (le) console.error('Logs error:', le);
            if(l) adminState.logs = l;

            const {data:acc, error:acce} = await supabaseClient.from('system_accounts').select('*');
            if (acce) console.error('Accounts error:', acce);
            if(acc) adminState.accounts = acc;

            console.log('✅ Admin data refreshed:', adminState.users.length, 'users,', adminState.logs.length, 'logs');
        } catch(e) {
            console.error('CRITICAL LOAD ERROR:', e);
            showToast('Database Error: ' + e.message, 'error');
            adminState.users = demoUsers;
            adminState.slots = generateSlots();
        }
    } else {
        adminState.users = [...demoUsers];
        adminState.slots = generateSlots();
    }
    adminState.pendingUsers = adminState.users.filter(u=>u.authorization_status==='PENDING');
    renderAdmin();
}

// =====================
// RENDER
// =====================
function renderAdmin() {
    const occ = adminState.slots.filter(s=>s.status==='OCCUPIED').length;

    if(el('adminStatUsers')) el('adminStatUsers').textContent = adminState.users.length;
    if(el('adminStatPending')) el('adminStatPending').textContent = adminState.pendingUsers.length;
    if(el('adminStatEntries')) el('adminStatEntries').textContent = adminState.logs.filter(l => l.scan_type === 'ENTRY').length || 0;
    if(el('adminStatSlots')) el('adminStatSlots').textContent = `${adminState.slots.length-occ}/${adminState.slots.length}`;

    // Pending table
    if(el('pendingTable')) {
        el('pendingTable').innerHTML = adminState.pendingUsers.length ? adminState.pendingUsers.map(u=>`<tr class="hover:bg-white/60 border-b border-slate-100/50"><td class="p-4 font-bold text-slate-800">${u.full_name}</td><td class="p-4"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 uppercase">${u.role}</span></td><td class="p-4 text-sm text-slate-600">${u.vehicle_type||'--'} - ${u.vehicle_model||'--'}</td><td class="p-4 text-sm text-slate-500">${u.created_at?new Date(u.created_at).toLocaleDateString():'--'}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">PENDING</span></td><td class="p-4 text-right whitespace-nowrap"><button onclick="approveUser('${u.id}')" class="px-3 py-1.5 rounded-lg bg-charm-green text-white text-xs font-bold hover:bg-green-600 mr-1">Approve</button><button onclick="denyRegistration('${u.id}')" class="px-3 py-1.5 rounded-lg bg-charm-red text-white text-xs font-bold hover:bg-red-600">Deny</button></td></tr>`).join('') : '<tr><td colspan="6" class="p-8 text-center text-slate-400">No pending registrations</td></tr>';
    }

    // Users table
    if(el('usersTable')) {
        const search = (el('userSearch')?.value||'').toLowerCase();
        const role = el('roleFilter')?.value||'';
        let filtered = adminState.users.filter(u => u.authorization_status==='AUTHORIZED');
        if(search) filtered = filtered.filter(u => (u.full_name||'').toLowerCase().includes(search) || (u.rfid_uid||'').toLowerCase().includes(search) || (u.plate_number||'').toLowerCase().includes(search));
        if(role) filtered = filtered.filter(u => u.role===role);
        el('usersTable').innerHTML = filtered.length ? filtered.map(u=>`<tr class="hover:bg-white/60 border-b border-slate-100/50">
            <td class="p-4 font-bold text-slate-800">${u.full_name}</td>
            <td class="p-4"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 uppercase">${u.role}</span><div class="text-xs text-slate-500 mt-1">${u.program||'--'} • ${u.section||'--'}</div></td>
            <td class="p-4 font-mono text-xs">${u.rfid_uid ? `<span class="text-green-600 font-bold">${u.rfid_uid}</span>` : '<span class="text-yellow-600 font-bold">Not Assigned</span>'}</td>
            <td class="p-4"><div class="font-semibold text-slate-700">${u.vehicle_type||'--'} - ${u.vehicle_model||'--'}</div></td>
            <td class="p-4 font-mono font-bold text-slate-700">${u.plate_number||'--'}</td>
            <td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${u.rfid_uid?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${u.rfid_uid?'ACTIVE':'NO RFID'}</span></td>
            <td class="p-4 text-right whitespace-nowrap">
                <button onclick="openUserModal('${u.id}')" class="p-1.5 text-slate-400 hover:text-charm-dark rounded-lg hover:bg-slate-100" title="Edit / Assign RFID"><i data-lucide="edit" class="w-4 h-4"></i></button>
                <button onclick="deleteUser('${u.id}')" class="p-1.5 text-slate-400 hover:text-red-500 ml-1 rounded-lg hover:bg-red-50" title="Delete"><i data-lucide="trash" class="w-4 h-4"></i></button>
            </td></tr>`).join('') : '<tr><td colspan="7" class="p-8 text-center text-slate-400">No authorized users found</td></tr>';
    }

    // Slots Monitor - Grouped by Building/Row
    const renderSlots = (id) => {
        const c = el(id); if(!c) return;
        const groups = {};
        adminState.slots.forEach(s => {
            const row = (s.slot_row || 'Other').toUpperCase();
            if (!groups[row]) groups[row] = [];
            groups[row].push(s);
        });
        const rows = Object.keys(groups).sort();
        c.innerHTML = rows.map(row => {
            const slots = groups[row].sort((a,b) => a.slot_number.localeCompare(b.slot_number, undefined, {numeric:true}));
            return `
                <div class="col-span-full glass-card rounded-3xl p-6 border border-white/60 shadow-glass mb-6">
                    <div class="flex items-center justify-between mb-6">
                        <h3 class="font-display font-bold text-lg text-slate-800 flex items-center gap-2">
                            <i data-lucide="building-2" class="w-5 h-5 text-charm-dark"></i>
                            ${row} BUILDING
                        </h3>
                        <span class="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            ${slots.length} Total Slots
                        </span>
                    </div>
                    <div class="grid grid-cols-5 md:grid-cols-10 gap-3">
                        ${slots.map(s => {
                            const a = s.status==='AVAILABLE', o = s.status==='OCCUPIED';
                            const bg = a?'bg-charm-light/20 border-charm-light/40 text-charm-dark':o?'bg-red-50 border-red-200 text-red-600':'bg-yellow-50 border-yellow-200 text-yellow-700';
                            const dot = a?'bg-charm-green':o?'bg-red-500':'bg-yellow-400';
                            let occupant = '';
                            if (o && s.current_vehicle) {
                                const u = adminState.users.find(x => x.rfid_uid === s.current_vehicle);
                                occupant = `<div class="text-[9px] font-bold mt-1 text-slate-700 truncate w-full text-center px-1">${u ? u.full_name : s.current_vehicle}</div>`;
                            }
                            return `<div onclick="${o?'showSlotInfo(\''+s.current_vehicle+'\')':''}" class="rounded-xl p-3 border ${bg} flex flex-col items-center justify-center slot-card relative h-24 ${o?'cursor-pointer hover:scale-105 transition-transform':''}"><div class="w-full flex justify-end mb-1"><div class="w-2 h-2 rounded-full ${dot}"></div></div><div class="text-lg font-display font-bold">${s.slot_number}</div><div class="text-[10px] font-bold uppercase mt-1 ${occupant?'hidden':''}">${s.status}</div>${occupant}</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    };
    renderSlots('adminMonitorSlots');
    renderSlotsManagement();

    // Accounts
    if(el('accountsGrid')) {
        const guardAccounts = adminState.accounts.filter(acc => acc.role === 'GUARD');
        if (guardAccounts.length > 0) {
            el('accountsGrid').innerHTML = guardAccounts.map(acc => `
                <div class="glass-card p-6 rounded-3xl border border-white/60 shadow-glass flex flex-col items-center text-center animate-slide-up">
                    <div class="w-16 h-16 rounded-full bg-charm-mid text-white flex items-center justify-center mb-4 shadow-lg">
                        <i data-lucide="shield-check" class="w-8 h-8"></i>
                    </div>
                    <h3 class="font-display font-bold text-lg text-slate-800">${acc.username}</h3>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-widest mt-1">${acc.role}</span>
                    <div class="mt-6 flex gap-2 w-full">
                        <button onclick="openAccountModal('${acc.id}')" class="flex-1 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-1">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit Guard Account
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            el('accountsGrid').innerHTML = `<div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400"><i data-lucide="shield-off" class="w-10 h-10 mb-4 opacity-20"></i><p class="font-bold">No guard accounts found.</p></div>`;
        }
    }

    // Logs
    if(el('adminLogsTable')) {
        const recentLogs = adminState.logs.slice(0, 30);
        if (recentLogs.length) {
            el('adminLogsTable').innerHTML = recentLogs.map(l=>`<tr class="hover:bg-white/60 border-b border-slate-100/50"><td class="p-4 text-slate-500">${l.timestamp?new Date(l.timestamp).toLocaleTimeString('en-US',{hour12:false}):'--'}</td><td class="p-4 font-mono text-xs text-slate-400">${l.rfid_uid}</td><td class="p-4 font-bold text-slate-800">${l.users?.full_name||'Unknown'}</td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${l.scan_type==='ENTRY'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${l.scan_type}</span></td><td class="p-4 font-bold">${l.parking_slot||'--'}</td><td class="p-4 text-right"><span class="text-[10px] font-bold ${l.status==='AUTHORIZED'?'text-green-600':'text-red-600'}">●</span></td></tr>`).join('');
        } else {
            el('adminLogsTable').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">No logs found</td></tr>';
        }
    }

    // Ranking Tables
    if (el('studentRankingTable')) {
        const studentLogs = adminState.logs.filter(l => l.users?.role === 'Student');
        const counts = {};
        studentLogs.forEach(l => { const name = l.users?.full_name; if(name) counts[name] = (counts[name] || 0) + 1; });
        const ranked = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        el('studentRankingTable').innerHTML = ranked.length ? ranked.map(([name, count], i) => {
            const u = adminState.users.find(x => x.full_name === name);
            return `<tr class="border-b border-slate-50"><td class="p-3 text-center font-bold text-charm-dark">${i+1}</td><td class="p-3 font-semibold">${name}</td><td class="p-3 text-center text-slate-500">${u?.program||'--'}</td><td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">${count}</span></td></tr>`;
        }).join('') : '<tr><td colspan="4" class="p-8 text-center text-slate-300">No activity yet</td></tr>';
    }

    if (el('facultyRankingTable')) {
        const facultyLogs = adminState.logs.filter(l => l.users?.role === 'Faculty' || l.users?.role === 'Staff');
        const counts = {};
        facultyLogs.forEach(l => { const name = l.users?.full_name; if(name) counts[name] = (counts[name] || 0) + 1; });
        const ranked = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        el('facultyRankingTable').innerHTML = ranked.length ? ranked.map(([name, count], i) => {
            const u = adminState.users.find(x => x.full_name === name);
            return `<tr class="border-b border-slate-50"><td class="p-3 text-center font-bold text-charm-mid">${i+1}</td><td class="p-3 font-semibold">${name}</td><td class="p-3 text-center text-slate-500">${u?.role||'--'}</td><td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">${count}</span></td></tr>`;
        }).join('') : '<tr><td colspan="4" class="p-8 text-center text-slate-300">No activity yet</td></tr>';
    }
    
    lucide.createIcons();
}

// =====================
// USER ACTIONS
// =====================
window.openUserModal = function(id = null) {
    const modal = el('userModal');
    const form = el('userForm');
    form.reset();
    el('formUserId').value = '';
    el('modalTitle').textContent = id ? 'Edit User' : 'Add New User';
    
    if (id) {
        const u = adminState.users.find(x => x.id === id);
        if (u) {
            el('formUserId').value = u.id;
            el('formName').value = u.full_name;
            el('formAge').value = u.age || '';
            el('formSex').value = u.sex || 'Male';
            el('formAddress').value = u.address || '';
            el('formProgram').value = u.program || '';
            el('formSection').value = u.section || '';
            el('formUid').value = u.rfid_uid || '';
            el('formRole').value = u.role || 'Student';
            el('formVehType').value = u.vehicle_type || 'None';
            el('formPlate').value = u.plate_number || '';
            el('formVehModel').value = u.vehicle_model || '';
            el('formVehColor').value = u.vehicle_color || '';
            el('prevProfile').src = u.profile_image || 'https://ui-avatars.com/api/?name=' + u.full_name;
            el('prevMotor').src = u.motorcycle_image || 'https://images.unsplash.com/photo-1558981403-c5f91cbba527?auto=format&fit=crop&q=80&w=200';
        }
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        el('userModalContent').classList.remove('scale-95');
    }, 10);
    lucide.createIcons();
};

window.closeUserModal = function() {
    const modal = el('userModal');
    modal.classList.remove('opacity-100');
    el('userModalContent').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

el('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('formUserId').value;
    const data = {
        full_name: el('formName').value,
        age: parseInt(el('formAge').value),
        sex: el('formSex').value,
        address: el('formAddress').value,
        program: el('formProgram').value,
        section: el('formSection').value,
        rfid_uid: el('formUid').value.trim().toUpperCase(),
        role: el('formRole').value,
        vehicle_type: el('formVehType').value,
        plate_number: el('formPlate').value.trim().toUpperCase(),
        vehicle_model: el('formVehModel').value,
        vehicle_color: el('formVehColor').value,
        authorization_status: 'AUTHORIZED',
        updated_at: new Date().toISOString()
    };

    try {
        showToast('Saving user...', 'info');
        let error;
        if (id) {
            const { error: err } = await supabaseClient.from('users').update(data).eq('id', id);
            error = err;
        } else {
            const { error: err } = await supabaseClient.from('users').insert(data);
            error = err;
        }
        if (error) throw error;
        showToast('User saved successfully!', 'success');
        closeUserModal();
        await loadData();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
});

window.approveUser = async function(id) {
    try {
        showToast('Approving user...', 'info');
        const { error } = await supabaseClient.from('users').update({ authorization_status: 'AUTHORIZED' }).eq('id', id);
        if (error) throw error;
        showToast('User approved!', 'success');
        await loadData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
};

window.denyRegistration = async function(id) {
    if (!confirm('Are you sure you want to deny this registration?')) return;
    try {
        showToast('Denying registration...', 'info');
        const { error } = await supabaseClient.from('users').delete().eq('id', id);
        if (error) throw error;
        showToast('Registration denied.', 'success');
        await loadData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
};

window.deleteUser = async function(id) {
    if (!confirm('Delete this user permanently?')) return;
    try {
        const { error } = await supabaseClient.from('users').delete().eq('id', id);
        if (error) throw error;
        showToast('User deleted.', 'success');
        await loadData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
};

// =====================
// SLOT ACTIONS
// =====================
window.openSlotManagementModal = function(slot = null) {
    const modal = el('slotManagementModal');
    el('slotForm').reset();
    el('formSlotId').value = '';
    el('slotModalTitle').textContent = slot ? 'Edit Parking Slot' : 'Add Parking Slot';
    
    if (slot) {
        el('formSlotId').value = slot.id;
        el('formSlotNumber').value = slot.slot_number;
        el('formSlotRow').value = slot.slot_row;
        el('formSlotStatus').value = slot.status === 'OCCUPIED' ? 'AVAILABLE' : slot.status;
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        el('slotManagementModalContent').classList.remove('scale-95');
    }, 10);
};

window.closeSlotManagementModal = function() {
    const modal = el('slotManagementModal');
    modal.classList.remove('opacity-100');
    el('slotManagementModalContent').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.editSlot = function(id) {
    const slot = adminState.slots.find(s => s.id === id);
    if (slot) openSlotManagementModal(slot);
};

el('slotForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('formSlotId').value;
    const num = el('formSlotNumber').value.trim();
    const row = el('formSlotRow').value.trim();
    const status = el('formSlotStatus').value;

    const payload = {
        slot_number: num,
        slot_row: row,
        status: status,
        updated_at: new Date().toISOString()
    };

    console.log('💾 Attempting to save slot:', payload);

    try {
        showToast('Saving slot...', 'info');
        let result;
        if (id) {
            console.log('🔄 Updating existing slot ID:', id);
            result = await supabaseClient.from('parking_slots').update(payload).eq('id', id);
        } else {
            console.log('➕ Inserting new slot...');
            result = await supabaseClient.from('parking_slots').insert(payload);
        }

        if (result.error) {
            console.error('❌ Supabase Save Error:', result.error);
            throw result.error;
        }

        console.log('✅ Slot saved successfully!', result.data);
        showToast('Slot saved successfully!', 'success');
        closeSlotManagementModal();
        await loadData();
    } catch (err) {
        console.error('❌ Catch Block Error:', err);
        showToast('Save Failed: ' + (err.message || 'Unknown error'), 'error');
    }
});

window.deleteSlot = async function(id, status) {
    if (status === 'OCCUPIED') { showToast('Cannot delete an occupied slot!', 'error'); return; }
    if (!confirm('Delete this parking slot?')) return;
    try {
        const { error } = await supabaseClient.from('parking_slots').delete().eq('id', id);
        if (error) throw error;
        showToast('Slot deleted.', 'success');
        await loadData();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
};

// =====================
// ANALYTICS
// =====================
let chart1, chart2, chart3;
function initCharts() {
    if(!window.Chart) return;
    const students = adminState.users.filter(u=>u.role==='Student').length;
    const faculty = adminState.users.filter(u=>u.role==='Faculty').length;
    const staff = adminState.users.filter(u=>u.role==='Staff').length;
    const ctx1 = el('chartUserTypes');
    if(ctx1) {
        if(chart1) chart1.destroy();
        chart1 = new Chart(ctx1,{type:'doughnut',data:{labels:['Students','Faculty','Staff'],datasets:[{data:[students,faculty,staff],backgroundColor:['#0E4B3A','#1F6B4F','#F2B827'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
    }

    const ctx2 = el('chartEntryExit');
    if(ctx2) {
        if(chart2) chart2.destroy();
        const entries = adminState.logs.filter(l => l.scan_type === 'ENTRY').length;
        const exits = adminState.logs.filter(l => l.scan_type === 'EXIT').length;
        chart2 = new Chart(ctx2,{type:'bar',data:{labels:['Entries','Exits'],datasets:[{label:'Total Activity',data:[entries,exits],backgroundColor:['#22C55E','#EF4444'],borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{display:false}}}}});
    }

    const ctx3 = el('chartPeakHours');
    if(ctx3) {
        if(chart3) chart3.destroy();
        const hours = Array(24).fill(0);
        adminState.logs.forEach(l => { if(l.timestamp) { const h = new Date(l.timestamp).getHours(); hours[h]++; } });
        chart3 = new Chart(ctx3,{type:'line',data:{labels:hours.map((_,i)=>i+':00'),datasets:[{label:'Activity',data:hours,borderColor:'#1F6B4F',backgroundColor:'rgba(31,107,79,0.1)',fill:true,tension:0.4,borderWidth:3,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}}}});
    }
}

// =====================
// REALTIME & INIT
// =====================
function setupRealtime() {
    if (!isConnected || !supabaseClient) return;
    supabaseClient.channel('admin-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_slots' }, () => { loadData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => { loadData(); })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parking_logs' }, () => { loadData(); })
        .subscribe();
}

// Account Modal logic
window.openAccountModal = function(id) {
    const m = el('accountModal');
    el('accountForm').reset();
    if(id) {
        const acc = adminState.accounts.find(a => a.id === id);
        if(acc) {
            el('formAccId').value = acc.id;
            el('formAccUser').value = acc.username;
            el('formAccPass').value = acc.password;
            el('formAccRole').value = acc.role;
        }
    }
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); el('accountModalContent').classList.remove('scale-95'); }, 10);
};

window.closeAccountModal = function() {
    const m = el('accountModal');
    m.classList.add('opacity-0'); el('accountModalContent').classList.add('scale-95');
    setTimeout(() => m.classList.add('hidden'), 300);
};

el('accountForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('formAccId').value;
    const data = { username: el('formAccUser').value, password: el('formAccPass').value, role: el('formAccRole').value, updated_at: new Date().toISOString() };
    try {
        const { error } = await supabaseClient.from('system_accounts').upsert({ id: id || undefined, ...data }, { onConflict: 'role' });
        if (error) throw error;
        showToast('Account updated!', 'success');
        closeAccountModal(); await loadData();
    } catch(err) { showToast('Error: ' + err.message, 'error'); }
});

window.togglePass = function(id, btn) {
    const input = el(id);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
};

window.showSlotInfo = function(uid) {
    const u = adminState.users.find(x => x.rfid_uid === uid);
    if (!u) return;
    el('modalName').textContent = u.full_name;
    el('modalRole').textContent = u.role;
    el('modalProgram').textContent = `${u.program} • ${u.section}`;
    el('modalPlate').textContent = u.plate_number;
    el('modalVehType').textContent = u.vehicle_type;
    el('modalVehModel').textContent = u.vehicle_model;
    el('modalVehImage').src = u.motorcycle_image || '';
    el('modalProfileImage').src = u.profile_image || '';
    const m = el('slotInfoModal');
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.add('opacity-100'); el('slotInfoContent').classList.remove('scale-95'); }, 10);
};

window.closeSlotModal = function() {
    const m = el('slotInfoModal');
    m.classList.remove('opacity-100'); el('slotInfoContent').classList.add('scale-95');
    setTimeout(() => m.classList.add('hidden'), 300);
};

setupRealtime();
loadData();

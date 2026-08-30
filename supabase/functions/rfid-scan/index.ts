// supabase/functions/rfid-scan/index.ts
// CHARRMPASS — Edge Function v2.0
// Handles automatic ENTRY / EXIT logic and Visitor/Emergency tags.
// Uses SERVICE_ROLE_KEY for safe atomic writes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LCD payload helper
function lcdPayload(line1: string, line2: string, line3: string, line4: string) {
  return { lcd_line1: line1, lcd_line2: line2, lcd_line3: line3, lcd_line4: line4 }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use SERVICE_ROLE to bypass RLS for atomic operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { rfid_uid, device_id } = await req.json()

    if (!rfid_uid) {
      return new Response(JSON.stringify({
        status: 'ERROR',
        message: 'Missing rfid_uid',
        ...lcdPayload('CHARRMPASS', '-----------', 'SCAN ERROR', 'NO UID')
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const uid = String(rfid_uid).trim().toUpperCase()

    // ─── 1. UPDATE DEVICE HEARTBEAT ───────────────────────────────────────────
    if (device_id) {
      await supabase
        .from('devices')
        .update({ last_online: new Date().toISOString(), status: 'ONLINE' })
        .eq('esp32_identifier', device_id)
    }

    // ─── 2. CHECK SPECIAL TAGS (Visitor / Emergency) ──────────────────────────
    const { data: specialTag } = await supabase
      .from('special_tags')
      .select('*')
      .eq('rfid_uid', uid)
      .maybeSingle()

    if (specialTag) {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

      // Check if already inside (open session)
      const { data: openLog } = await supabase
        .from('parking_logs')
        .select('id, entry_time')
        .eq('rfid_uid', uid)
        .is('exit_time', null)
        .maybeSingle()

      if (openLog) {
        // EXIT: close the session
        const entryTime = new Date(openLog.entry_time)
        const durationMinutes = Math.round((now.getTime() - entryTime.getTime()) / 60000)
        await supabase.from('parking_logs').update({
          exit_time: now.toISOString(),
          duration_minutes: durationMinutes,
          status: 'COMPLETED'
        }).eq('id', openLog.id)

        return new Response(JSON.stringify({
          status: 'AUTHORIZED',
          action: 'EXIT',
          tag_type: specialTag.type,
          label: specialTag.label || specialTag.type,
          duration_minutes: durationMinutes,
          ...lcdPayload('CHARRMPASS', 'AUTHORIZED', specialTag.label || specialTag.type, `EXIT  ${timeStr}`)
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        // ENTRY: open new session
        await supabase.from('parking_logs').insert({
          rfid_uid: uid,
          vehicle_id: null,
          user_id: null,
          entry_time: now.toISOString(),
          exit_time: null,
          status: 'ACTIVE',
          device_id: device_id || null,
          remarks: `${specialTag.type} card: ${specialTag.label || ''}`
        })

        return new Response(JSON.stringify({
          status: 'AUTHORIZED',
          action: 'ENTRY',
          tag_type: specialTag.type,
          label: specialTag.label || specialTag.type,
          ...lcdPayload('CHARRMPASS', 'AUTHORIZED', specialTag.label || specialTag.type, `ENTRY ${timeStr}`)
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // ─── 3. LOOK UP RFID CARD → VEHICLE → USER ────────────────────────────────
    const { data: card } = await supabase
      .from('rfid_cards')
      .select(`
        id, rfid_uid, authorization_status,
        vehicles ( id, plate_number, vehicle_type, vehicle_model, vehicle_color ),
        users ( id, full_name, role, program, section, profile_image )
      `)
      .eq('rfid_uid', uid)
      .maybeSingle()

    // ─── 4. NOT REGISTERED ────────────────────────────────────────────────────
    if (!card) {
      await supabase.from('parking_logs').insert({
        rfid_uid: uid,
        vehicle_id: null,
        user_id: null,
        entry_time: new Date().toISOString(),
        exit_time: new Date().toISOString(),
        duration_minutes: 0,
        status: 'DENIED',
        device_id: device_id || null,
        remarks: 'RFID not registered in system'
      })

      return new Response(JSON.stringify({
        status: 'UNAUTHORIZED',
        message: 'RFID not registered.',
        ...lcdPayload('CHARRMPASS', '-----------', 'ACCESS DENIED', 'INVALID CARD')
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── 5. PENDING / DENIED STATUS ───────────────────────────────────────────
    if (card.authorization_status === 'PENDING') {
      await supabase.from('parking_logs').insert({
        rfid_uid: uid,
        vehicle_id: (card.vehicles as any)?.id || null,
        user_id: (card.users as any)?.id || null,
        entry_time: new Date().toISOString(),
        exit_time: new Date().toISOString(),
        duration_minutes: 0,
        status: 'DENIED',
        device_id: device_id || null,
        remarks: 'Registration pending admin approval'
      })

      return new Response(JSON.stringify({
        status: 'PENDING',
        message: 'Account pending admin approval.',
        user: { name: (card.users as any)?.full_name },
        ...lcdPayload('CHARRMPASS', (card.users as any)?.full_name?.split(' ')[0] || 'USER', 'PENDING', 'NOT APPROVED')
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (card.authorization_status === 'DENIED') {
      await supabase.from('parking_logs').insert({
        rfid_uid: uid,
        vehicle_id: (card.vehicles as any)?.id || null,
        user_id: (card.users as any)?.id || null,
        entry_time: new Date().toISOString(),
        exit_time: new Date().toISOString(),
        duration_minutes: 0,
        status: 'DENIED',
        device_id: device_id || null,
        remarks: 'Registration denied by admin'
      })

      return new Response(JSON.stringify({
        status: 'DENIED',
        message: 'Access denied.',
        user: { name: (card.users as any)?.full_name },
        ...lcdPayload('CHARRMPASS', (card.users as any)?.full_name?.split(' ')[0] || 'USER', 'DENIED', 'SEE ADMIN')
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ─── 6. AUTHORIZED — DETERMINE ENTRY vs EXIT ──────────────────────────────
    const vehicle = card.vehicles as any
    const user    = card.users    as any
    const plate   = vehicle?.plate_number || uid
    const now     = new Date()
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })

    // Find open session for this RFID (exit_time IS NULL)
    const { data: openSession } = await supabase
      .from('parking_logs')
      .select('id, entry_time')
      .eq('rfid_uid', uid)
      .is('exit_time', null)
      .maybeSingle()

    if (openSession) {
      // ── EXIT ────────────────────────────────────────────────────────────────
      const entryTime      = new Date(openSession.entry_time)
      const durationMinutes = Math.round((now.getTime() - entryTime.getTime()) / 60000)

      await supabase.from('parking_logs').update({
        exit_time:        now.toISOString(),
        duration_minutes: durationMinutes,
        status:           'COMPLETED'
      }).eq('id', openSession.id)

      return new Response(JSON.stringify({
        status:           'AUTHORIZED',
        action:           'EXIT',
        plate:            plate,
        duration_minutes: durationMinutes,
        user: {
          name:    user?.full_name,
          role:    user?.role,
          program: user?.program,
          section: user?.section,
        },
        vehicle: {
          type:  vehicle?.vehicle_type,
          model: vehicle?.vehicle_model,
          plate: plate,
          color: vehicle?.vehicle_color,
        },
        ...lcdPayload('CHARRMPASS', 'AUTHORIZED', plate, `EXIT  ${timeStr}`)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } else {
      // ── ENTRY ───────────────────────────────────────────────────────────────
      await supabase.from('parking_logs').insert({
        rfid_uid:   uid,
        vehicle_id: vehicle?.id  || null,
        user_id:    user?.id     || null,
        entry_time: now.toISOString(),
        exit_time:  null,
        status:     'ACTIVE',
        device_id:  device_id || null,
        remarks:    `Authorized ENTRY for ${user?.full_name || uid}`
      })

      return new Response(JSON.stringify({
        status: 'AUTHORIZED',
        action: 'ENTRY',
        plate:  plate,
        user: {
          name:    user?.full_name,
          role:    user?.role,
          program: user?.program,
          section: user?.section,
        },
        vehicle: {
          type:  vehicle?.vehicle_type,
          model: vehicle?.vehicle_model,
          plate: plate,
          color: vehicle?.vehicle_color,
        },
        ...lcdPayload('CHARRMPASS', 'AUTHORIZED', plate, `ENTRY ${timeStr}`)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

  } catch (error) {
    console.error('RFID Scan Error:', error)
    return new Response(JSON.stringify({
      error: error.message,
      ...lcdPayload('CHARRMPASS', '-----------', 'SYSTEM ERROR', 'TRY AGAIN')
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})

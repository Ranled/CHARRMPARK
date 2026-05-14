// supabase/functions/rfid-scan/index.ts
// Supabase Edge Function to handle RFID Scans from ESP32

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { rfid_uid, device_id } = await req.json()

    if (!rfid_uid) {
      return new Response(JSON.stringify({ error: 'Missing RFID UID' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // Check if user exists and is authorized
    const { data: user, error: userError } = await supabaseClient
      .from('users').select('*').eq('rfid_uid', rfid_uid).single()

    let authStatus = 'DENIED'
    let scanType = 'ENTRY'
    let assignedSlot = null
    let responseData = { status: 'UNAUTHORIZED', message: 'RFID not registered.', lcd_line1: 'ACCESS DENIED', lcd_line2: 'INVALID CARD' }

    if (user && user.authorization_status === 'AUTHORIZED') {
      authStatus = 'AUTHORIZED'

      // Check if vehicle currently occupies a slot (EXIT logic)
      const { data: occupiedSlot } = await supabaseClient
        .from('parking_slots').select('*').eq('current_vehicle', rfid_uid).single()

      if (occupiedSlot) {
        scanType = 'EXIT'
        assignedSlot = occupiedSlot.slot_number
        await supabaseClient.from('parking_slots').update({ status: 'AVAILABLE', current_vehicle: null, updated_at: new Date().toISOString() }).eq('id', occupiedSlot.id)
        responseData = { status: 'AUTHORIZED', event: 'EXIT', slot: assignedSlot, message: 'Goodbye!', user: { name: user.full_name, role: user.role }, lcd_line1: 'THANK YOU', lcd_line2: 'GOODBYE' }
      } else {
        scanType = 'ENTRY'
        const { data: freeSlot } = await supabaseClient
          .from('parking_slots').select('*').eq('status', 'AVAILABLE').limit(1).single()

        if (freeSlot) {
          assignedSlot = freeSlot.slot_number
          await supabaseClient.from('parking_slots').update({ status: 'OCCUPIED', current_vehicle: rfid_uid, updated_at: new Date().toISOString() }).eq('id', freeSlot.id)
          responseData = { status: 'AUTHORIZED', event: 'ENTRY', slot: assignedSlot, message: 'Welcome!', user: { name: user.full_name, role: user.role }, lcd_line1: 'ACCESS GRANTED', lcd_line2: 'SLOT: ' + assignedSlot }
        } else {
          authStatus = 'DENIED'
          responseData = { status: 'DENIED', event: 'PARKING_FULL', message: 'Parking is full.', lcd_line1: 'PARKING FULL', lcd_line2: 'TRY LATER' }
        }
      }
    } else if (user && user.authorization_status === 'PENDING') {
      responseData = { status: 'DENIED', message: 'Account pending approval.', lcd_line1: 'PENDING', lcd_line2: 'NOT APPROVED' }
    }

    // Log the scan
    await supabaseClient.from('parking_logs').insert({
      rfid_uid, user_id: user?.id || null, scan_type: scanType, status: authStatus, parking_slot: assignedSlot, remarks: responseData.message
    })

    // Update device heartbeat
    if (device_id) {
      await supabaseClient.from('devices').update({ last_online: new Date().toISOString(), status: 'ONLINE' }).eq('esp32_identifier', device_id)
    }

    return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})

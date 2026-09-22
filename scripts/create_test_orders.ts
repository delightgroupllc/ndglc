import 'dotenv/config';
import { pool } from '../src/lib/db.js';

async function main() {
  console.log('Searching for ABC customer or existing orders...');
  const custRes = await pool.query(`SELECT * FROM customers WHERE name ILIKE '%ABC%' OR company_name ILIKE '%ABC%' LIMIT 5`);
  console.log('Customers found:', custRes.rows);

  let cust = custRes.rows[0];
  if (!cust) {
    const anyCust = await pool.query(`SELECT * FROM customers LIMIT 1`);
    cust = anyCust.rows[0] || {
      name: 'John Doe',
      company_name: 'ABC Company LLC',
      customer_code: 'CUST-ABC-001',
      email: 'procurement@abccompany.ae',
      phone: '+971 4 123 4567',
      billing_address: 'ABC Tower, Level 14, Business Bay, Dubai, UAE',
      shipping_address: 'ABC Warehouse, Al Quoz Industrial Area 2, Dubai, UAE',
      tax_number: '100234567800003'
    };
  }

  const custName = cust.name || 'John Doe';
  const companyName = cust.company_name || 'ABC Company LLC';
  const email = cust.email || 'purchasing@abccompany.com';
  const phone = cust.phone || '+971 4 555 0199';
  const billingAddr = cust.billing_address || 'ABC Tower, Suite 402, Business Bay, Dubai, UAE';
  const shippingAddr = cust.shipping_address || 'ABC Logistics Hub, Warehouse 12, Al Quoz 3, Dubai, UAE';
  const trn = cust.tax_number || cust.vat_number || '100492817200003';

  // Available division terms
  const termsRes = await pool.query(`SELECT identifier, title FROM legal_artifacts WHERE division = 'dtl' AND show_in_invoice = true LIMIT 10`);
  const activeTermsArray = termsRes.rows.map((t: any) => t.identifier);
  const paymentTermsJson = JSON.stringify(activeTermsArray);

  // ══════════════════════════════════════════════════════════════════════
  // ORDER 1: SHORT ORDER (2 ITEMS)
  // ══════════════════════════════════════════════════════════════════════
  const shortNum = `INV-2026-ABC-02-${Date.now().toString().slice(-4)}`;
  const item1 = {
    desc: 'Architectural LED Wall Washer 24W 3000K IP66',
    catRef: 'DTL-WW-24W-3K',
    spec: 'Die-cast aluminum, 24W, 3000K Warm White, Beam 15x30 deg, 24V DC input',
    qty: 5,
    price: 320.00
  };
  const item2 = {
    desc: 'Constant Voltage LED Driver 150W 24V IP67 Meanwell',
    catRef: 'DTL-DRV-150W-24V',
    spec: '150W 24V DC output, 90-305V AC input, IP67 Waterproof, SELV compliant',
    qty: 2,
    price: 185.00
  };

  const subtotal1 = item1.qty * item1.price + item2.qty * item2.price;
  const vat1 = subtotal1 * 0.05;
  const total1 = subtotal1 + vat1;

  const inv1Res = await pool.query(
    `INSERT INTO invoices (
      invoice_number, customer_name, customer_email, customer_phone, company_name, company_vat,
      billing_address, shipping_address, order_type, source_division,
      issue_date, due_date, subtotal, gst_amount, discount_type, discount_value, discount_amount, total_amount,
      payment_status, internal_notes, show_images, lpo_number, payment_terms, signatory_incharge
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    RETURNING id, invoice_number`,
    [
      shortNum, custName, email, phone, companyName, trn,
      billingAddr, shippingAddr, 'standard', 'DTL',
      '2026-09-22', '2026-10-22', subtotal1, vat1, 'fixed', 0, 0, total1,
      'draft', 'Playwright Continuous Flow Test - 2 Items', true, 'LPO-ABC-2026-01', paymentTermsJson, 'any'
    ]
  );
  const inv1Id = inv1Res.rows[0].id;

  await pool.query(
    `INSERT INTO invoice_items (invoice_id, catalogue_ref, description, tech_spec, quantity, unit_price, tax_type, tax_value, tax_amount, total_price, item_image, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12),
            ($13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      inv1Id, item1.catRef, item1.desc, item1.spec, item1.qty, item1.price, 'percentage', 5, (item1.qty * item1.price * 0.05), (item1.qty * item1.price * 1.05), '/dgslogo.jpg', 0,
      inv1Id, item2.catRef, item2.desc, item2.spec, item2.qty, item2.price, 'percentage', 5, (item2.qty * item2.price * 0.05), (item2.qty * item2.price * 1.05), '/dtllogo.jpg', 1
    ]
  );
  console.log(`Created Short Order (2 items): ${shortNum} [ID: ${inv1Id}]`);

  // ══════════════════════════════════════════════════════════════════════
  // ORDER 2: LONG ORDER (12 ITEMS)
  // ══════════════════════════════════════════════════════════════════════
  const longNum = `INV-2026-ABC-12-${Date.now().toString().slice(-4)}`;
  const longItems = [
    { desc: 'Deep Recessed Architectural Spotlight 15W 3000K CRI95', catRef: 'DTL-SP-15W-CRI95', spec: 'Anti-glare UGR<16, 15W, 3000K Warm White, Beam 24 deg, Triac Dimmable', qty: 24, price: 145.00 },
    { desc: 'Modular Surface Mounted Downlight 20W 4000K', catRef: 'DTL-DL-20W-4K', spec: 'Cylindrical housing white matte, 20W, 4000K Neutral White, Beam 36 deg', qty: 16, price: 175.00 },
    { desc: 'High Efficiency LED Strip 24V 19.2W/m 2700K (50m Roll)', catRef: 'DTL-ST-19W-27K', spec: '24V DC, 2835 SMD 120 LEDs/m, IP20 Indoor, 3-step MacAdam', qty: 4, price: 380.00 },
    { desc: 'Ultra-Slim Aluminum Profile with Frosted Diffuser 2.5m', catRef: 'DTL-PRF-SLIM-2.5M', spec: 'Anodized aluminum, recessed flange, PMMA frosted opal diffuser', qty: 20, price: 65.00 },
    { desc: 'DALI-2 Dimmable Constant Voltage Driver 240W 24V', catRef: 'DTL-DRV-DALI-240W', spec: '240W 24V DC, DALI-2 & Push-DIM compatible, Active PFC, 5 Year Warranty', qty: 6, price: 295.00 },
    { desc: 'Inground Waterproof Uplight IP68 12W 3000K 316L SS', catRef: 'DTL-UG-12W-IP68', spec: 'Marine grade 316L stainless steel front ring, tempered glass, 12W 24V', qty: 12, price: 260.00 },
    { desc: 'Submersible Garden Fountain Light RGBW 18W IP68 DMX', catRef: 'DTL-FNT-18W-DMX', spec: 'Submersible IP68, 18W RGBW 4-in-1, DMX512 controllable, bracket mount', qty: 8, price: 340.00 },
    { desc: 'Low-Voltage Landscape Spike Spotlight 7W 3000K IP65', catRef: 'DTL-SPK-7W-3K', spec: 'Cast aluminum textured bronze finish, ground spike included, 7W 12V AC/DC', qty: 18, price: 110.00 },
    { desc: 'Linear Wall Grazer 36W 3000K Optical Lens 10x45 deg 1000mm', catRef: 'DTL-LIN-36W-GRZ', spec: 'Heavy-duty extruded aluminum, 36W, 1000mm length, integrated surge protection', qty: 10, price: 420.00 },
    { desc: 'Magnetic Track Surface Track Rail 48V 2.0m Black', catRef: 'DTL-TRK-48V-2M-BLK', spec: 'Extruded aluminum 48V low voltage track rail, surface mounted installation', qty: 14, price: 190.00 },
    { desc: 'Magnetic Track Linear Diffused Module 48V 20W 3000K', catRef: 'DTL-TRK-MOD-20W', spec: 'Snap-in magnetic installation, 20W, 3000K, Opal diffuser, 600mm length', qty: 14, price: 165.00 },
    { desc: 'Emergency Lighting Conversion Kit 3hr Battery Pack', catRef: 'DTL-EM-KIT-3HR', spec: 'Self-test intelligent emergency module, Ni-Cd 3.6V battery, 3 hours backup', qty: 15, price: 125.00 }
  ];

  let subtotal2 = 0;
  longItems.forEach(i => subtotal2 += i.qty * i.price);
  const vat2 = subtotal2 * 0.05;
  const total2 = subtotal2 + vat2;

  const inv2Res = await pool.query(
    `INSERT INTO invoices (
      invoice_number, customer_name, customer_email, customer_phone, company_name, company_vat,
      billing_address, shipping_address, order_type, source_division,
      issue_date, due_date, subtotal, gst_amount, discount_type, discount_value, discount_amount, total_amount,
      payment_status, internal_notes, show_images, lpo_number, payment_terms, signatory_incharge
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    RETURNING id, invoice_number`,
    [
      longNum, custName, email, phone, companyName, trn,
      billingAddr, shippingAddr, 'standard', 'DTL',
      '2026-09-22', '2026-10-22', subtotal2, vat2, 'fixed', 0, 0, total2,
      'draft', 'Playwright Continuous Flow Test - 12 Items Multi-Page Slicing', true, 'LPO-ABC-2026-02', paymentTermsJson, 'any'
    ]
  );
  const inv2Id = inv2Res.rows[0].id;

  for (let idx = 0; idx < longItems.length; idx++) {
    const itm = longItems[idx];
    await pool.query(
      `INSERT INTO invoice_items (invoice_id, catalogue_ref, description, tech_spec, quantity, unit_price, tax_type, tax_value, tax_amount, total_price, item_image, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        inv2Id, itm.catRef, itm.desc, itm.spec, itm.qty, itm.price, 'percentage', 5,
        (itm.qty * itm.price * 0.05), (itm.qty * itm.price * 1.05), (idx % 2 === 0 ? '/dtllogo.jpg' : '/dgslogo.jpg'), idx
      ]
    );
  }
  console.log(`Created Long Order (12 items): ${longNum} [ID: ${inv2Id}]`);

  console.log('\n--- CREATED TEST INVOICE IDS ---');
  console.log(`SHORT_ORDER_ID=${inv1Id}`);
  console.log(`SHORT_ORDER_NUM=${shortNum}`);
  console.log(`LONG_ORDER_ID=${inv2Id}`);
  console.log(`LONG_ORDER_NUM=${longNum}`);

  await pool.end();
}

main().catch(err => {
  console.error('Error creating test orders:', err);
  process.exit(1);
});

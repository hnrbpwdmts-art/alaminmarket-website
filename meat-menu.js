/* =====================================================================
   MEAT ORDER MENU — used by the "Order meat" page (order/index.html)
   ---------------------------------------------------------------------
   Categories -> items -> choices. Keep the quotes and commas as they are.
   A category can have a "note" shown above its items.

   Each item:
     name:     what the customer sees, e.g. "Whole Chicken"
     note:     optional short line shown when the item is opened, e.g. "Skinless"
     price:    price, e.g. 4.99. Use null to show "Price coming soon".
     priceUnit: what the price is for: "lb" or "each"
     unit:     how customers choose the amount: "lb" (by weight) or
               "each" (by count, e.g. number of chickens)
     units:    to let customers choose, list both, e.g. ["lb", "each"]
               (the first one is selected to start)
     countName: for "each" items, e.g. ["chicken", "chickens"]
     avgWeight: for items priced per lb but ordered by count: the average
               weight of one, in lb, used for the estimated total.
               Leave it out to show "priced by weight" instead.
     min, step: smallest amount and how much each + / - press adds
     days:     days it can be picked up or delivered, e.g. ["Sat", "Sun"].
               Leave it out to allow every day.
     choices:  the questions asked, in order, e.g. ["Skin", "Pieces"]
     Every item should offer an uncut option, e.g. "Whole (no cutting)".
     combos:   which answers go together. Each block allows every mix of
               the answers listed in it. Only combinations listed in a
               block can be ordered.
   ===================================================================== */

window.MEAT_MENU = {

  /* Orders sent by text go to this number (digits only, with country code 1).
     It must be a mobile number that can receive texts. */
  textNumber: "14245273540",

  /* Orders sent by WhatsApp go to the WhatsApp number in site-config.js. */

  orderPrefix: "A",          // order numbers look like A1112-482

  pickup: {
    enabled: true,
    times: ["10 AM–12 PM", "12–3 PM", "3–6 PM", "6–8 PM"]
  },

  delivery: {
    enabled: false,          // true = offer delivery (turn on once delivery is ready)
    times: ["12–3 PM", "3–6 PM", "6–8 PM"],
    /* Shown until online delivery quotes are set up. */
    note: "We'll text you the delivery fee together with your total."
  },

  daysAhead: 7,              // how many days ahead customers can choose
  closedDays: [],            // e.g. ["2026-12-25"] to block a date

  categories: [
    {
      id: "chicken",
      name: "Chicken",
      items: [
        {
          id: "whole-chicken",
          name: "Whole Chicken",
          price: 3.49,
          priceUnit: "lb",
          unit: "each",
          countName: ["chicken", "chickens"],
          avgWeight: 3,
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "Pieces": ["Whole (no cutting)"], "BBQ cut": ["No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["2 pieces", "4 pieces", "6 pieces", "8 pieces"], "BBQ cut": ["Yes", "No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["12 pieces", "14 pieces", "16 pieces", "18 pieces", "20 pieces"], "BBQ cut": ["No"] }
          ]
        },
        {
          id: "whole-chicken-hand",
          name: "Whole Chicken (Hand Slaughtered)",
          price: 3.99,
          priceUnit: "lb",
          unit: "each",
          countName: ["chicken", "chickens"],
          avgWeight: 3,
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "Pieces": ["Whole (no cutting)"], "BBQ cut": ["No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["2 pieces", "4 pieces", "6 pieces", "8 pieces"], "BBQ cut": ["Yes", "No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["12 pieces", "14 pieces", "16 pieces", "18 pieces", "20 pieces"], "BBQ cut": ["No"] }
          ]
        },
        {
          id: "rooster",
          name: "Rooster",
          note: "Priced per bird.",
          price: 21.99,
          priceUnit: "each",
          unit: "each",
          countName: ["rooster", "roosters"],
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "Pieces": ["Whole (no cutting)"], "BBQ cut": ["No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["2 pieces", "4 pieces", "6 pieces", "8 pieces"], "BBQ cut": ["Yes", "No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["12 pieces", "14 pieces", "16 pieces", "18 pieces", "20 pieces"], "BBQ cut": ["No"] }
          ]
        },
        {
          id: "leg-quarter",
          name: "Chicken Leg Quarter",
          price: 1.49,
          priceUnit: "lb",
          unit: "lb",
          units: ["lb", "each"],
          countName: ["leg quarter", "leg quarters"],
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "Pieces": ["Whole", "2 pieces"], "BBQ cut": ["Yes", "No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["3 pieces", "4 pieces"], "BBQ cut": ["No"] }
          ]
        },
        {
          id: "chicken-breast",
          name: "Boneless Chicken Breast",
          note: "Skinless. Sold by weight.",
          price: 4.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Extra small (about ¼ in, taco cut)", "Ground (thick)", "Ground (fine)", "Ground (very fine)"] }
          ]
        },
        {
          id: "chicken-breast-hand",
          name: "Boneless Chicken Breast (Hand Slaughtered)",
          note: "Skinless. Sold by weight.",
          price: 5.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Extra small (about ¼ in, taco cut)", "Ground (thick)", "Ground (fine)", "Ground (very fine)"] }
          ]
        },
        {
          id: "chicken-thigh",
          name: "Boneless Chicken Thigh",
          note: "Skinless. Sold by weight.",
          price: 3.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Extra small (about ¼ in, taco cut)", "Ground (thick)", "Ground (fine)", "Ground (very fine)"] }
          ]
        },
        {
          id: "drumsticks",
          name: "Chicken Drumsticks",
          note: "Sold by weight. Choose No BBQ cut to get them as is.",
          price: 1.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Skin", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "BBQ cut": ["Yes", "No"] }
          ]
        },
        {
          id: "wings",
          name: "Chicken Wings",
          note: "With skin. Sold by weight.",
          price: 3.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Split in two"] }
          ]
        }
      ]
    },
    {
      id: "lamb",
      name: "Lamb",
      note: "All our lamb is New Zealand grass-fed and comes frozen.",
      items: [
        {
          id: "lamb-leg",
          name: "Lamb Leg",
          note: "Cut on the band saw. Sold by weight.",
          price: 7.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Slices (1 in)"] }
          ]
        },
        {
          id: "lamb-shoulder",
          name: "Lamb Shoulder",
          note: "Cut on the band saw. Sold by weight.",
          price: 6.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Slices (1 in)", "Slices (½ in)"] }
          ]
        }
      ]
    }
  ]
};

/* =====================================================================
   MEAT ORDER MENU — used by the "Order meat" page (order/index.html)
   ---------------------------------------------------------------------
   Categories -> items -> choices. Keep the quotes and commas as they are.

   Each item:
     name:     what the customer sees, e.g. "Whole Chicken"
     price:    price, e.g. 4.99. Use null to show "Price coming soon".
     priceUnit: what the price is for: "lb" or "each"
     unit:     how customers choose the amount: "lb" (by weight) or
               "each" (by count, e.g. number of chickens)
     countName: for "each" items, e.g. ["chicken", "chickens"]
     avgWeight: for items priced per lb but ordered by count: the average
               weight of one, in lb, used for the estimated total.
               Leave it out to show "priced by weight" instead.
     min, step: smallest amount and how much each + / - press adds
     days:     days it can be picked up or delivered, e.g. ["Sat", "Sun"].
               Leave it out to allow every day.
     choices:  the questions asked, in order, e.g. ["Skin", "Pieces"]
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
    enabled: true,
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
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
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
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
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
          min: 1, step: 1,
          choices: ["Skin", "Pieces", "BBQ cut"],
          combos: [
            { "Skin": ["With skin", "Without skin"], "Pieces": ["Whole", "2 pieces"], "BBQ cut": ["Yes", "No"] },
            { "Skin": ["With skin", "Without skin"], "Pieces": ["3 pieces", "4 pieces"], "BBQ cut": ["No"] }
          ]
        }
      ]
    }
  ]
};

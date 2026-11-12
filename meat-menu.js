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
     priceChoice, prices: when the price depends on a choice, e.g.
               priceChoice: "Fat", prices: { "With fat": 6.99, "Without fat": 7.99 }
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

  /* Packing choices offered on every item (customers pick one).
     An item can have its own "packing" list instead, and "packingSkip"
     to hide the question for a choice, e.g. { "Pieces": "Whole (no cutting)" }. */
  packing: ["All in one bag", "Packed in 1 lb packs"],

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
          packing: ["1 whole chicken per bag", "½ chicken per bag"],
          packingSkip: { "Pieces": "Whole (no cutting)" },
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
          packing: ["1 whole chicken per bag", "½ chicken per bag"],
          packingSkip: { "Pieces": "Whole (no cutting)" },
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
          packing: ["1 whole rooster per bag", "½ rooster per bag"],
          packingSkip: { "Pieces": "Whole (no cutting)" },
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
        },
        {
          id: "lamb-shank",
          name: "Lamb Shank",
          note: "Cut on the band saw. Sold by weight.",
          price: 6.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (each shank cut in 2)", "Medium pieces (each shank cut in 3)", "Small pieces (each shank cut in 4)"] }
          ]
        },
        {
          id: "lamb-feet",
          name: "Lamb Feet",
          note: "Sold by weight.",
          price: 4.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Type", "Cut"],
          combos: [
            { "Type": ["Brown", "White"], "Cut": ["Whole (no cutting)", "2 pieces", "3 pieces", "4 pieces"] }
          ]
        }
      ]
    },
    {
      id: "beef",
      name: "Beef",
      items: [
        {
          id: "beef-boneless",
          name: "Boneless Beef",
          note: "Boneless only. Sold by weight.",
          priceChoice: "Fat",
          prices: { "With fat": 6.99, "Without fat": 7.99 },
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Fat", "Cut"],
          combos: [
            { "Fat": ["With fat", "Without fat"], "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)", "Extra small (about ¼ in, taco cut)", "Ground (thick)", "Ground (fine)", "Ground (very fine)"] }
          ]
        },
        {
          id: "beef-shank-boneless",
          name: "Boneless Beef Shank (for Nihari)",
          note: "Already cleaned. Sold by weight.",
          price: 9.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)"] }
          ]
        },
        {
          id: "beef-feet",
          name: "Beef Feet",
          note: "Priced by weight. Each foot is about 4 lb.",
          price: 5.99,
          priceUnit: "lb",
          unit: "each",
          countName: ["foot", "feet"],
          avgWeight: 4,
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Sliced (about 1½ in)", "Sliced and split in the middle"] }
          ]
        },
        {
          id: "beef-bones",
          name: "Beef Bones",
          note: "Cut on the band saw. Sold by weight.",
          price: 3.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces", "Medium pieces", "Small pieces"] }
          ]
        }
      ]
    },
    {
      id: "goat",
      name: "Goat",
      note: "Fresh baby goat is available Friday and Saturday only.",
      items: [
        {
          id: "baby-goat-mix",
          name: "Fresh Baby Goat (Mixed)",
          note: "Mixed cuts, sold by weight.",
          price: 13.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          days: ["Fri", "Sat"],
          choices: ["Cut"],
          combos: [
            { "Cut": ["As is (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)", "Very small pieces (about ½ in)"] }
          ]
        }
      ]
    },
    {
      id: "veal",
      name: "Veal",
      note: "Fresh veal is available Friday and Saturday only.",
      items: [
        {
          id: "veal-bone-in",
          name: "Fresh Veal (Mixed, Bone-in)",
          note: "Mixed bone-in cuts, sold by weight.",
          price: 8.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          days: ["Fri", "Sat"],
          choices: ["Cut"],
          combos: [
            { "Cut": ["As is (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)"] }
          ]
        },
        {
          id: "veal-boneless",
          name: "Fresh Veal (Boneless)",
          note: "Sold by weight.",
          price: 10.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          days: ["Fri", "Sat"],
          choices: ["Cut"],
          combos: [
            { "Cut": ["Whole (no cutting)", "Large pieces (about 3 in)", "Medium pieces (about 2 in)", "Small pieces (about 1 in)"] }
          ]
        },
        {
          id: "veal-ground",
          name: "Fresh Ground Veal",
          note: "Sold by weight.",
          price: 10.99,
          priceUnit: "lb",
          unit: "lb",
          min: 1, step: 1,
          days: ["Fri", "Sat"],
          choices: ["Cut"],
          combos: [
            { "Cut": ["Ground (thick)", "Ground (fine)", "Ground (very fine)"] }
          ]
        }
      ]
    }
  ]
};

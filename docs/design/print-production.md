# Print production

How to turn the design system's print spec into a physical A7 notebook: file set-up, test print, printing and binding. The values themselves live in the Print spec section of the design system; this tab only says how to apply and check them.

## Puzzle pages: from the generator

The web app's generated page is the source of truth for puzzle pages.

- Output a plain 74 × 105 mm page. Nothing on a puzzle page touches the edge, so it needs no bleed.
- Work in physical units: mm for layout, pt for lines and type, taken straight from the Print spec table.
- Through the browser's print dialog: `@page { size: 74mm 105mm; margin: 0 }` and `mm` units in the print stylesheet.
- Through a PDF library: check whether it counts in points. 1 mm is 2.835 pt.

## Cover: from Figma

The cover stays a Figma file, because the wordmark is drawn there. It is designed at 300 dpi, where 1 mm is 11.81 px, and it needs 3 mm of bleed (fonds perdus) because the orange runs off every edge.

| Guide               | Position in a 944 × 1310 px frame       |
| ------------------- | --------------------------------------- |
| Trim                | x 35 and 909, y 35 and 1275             |
| Safe left and right | x 82 and 862                            |
| Safe bottom         | y 1228                                  |
| Binding limit       | y 177, which is 35 px bleed plus 142 px |

- The current cover file is 952 × 1288 px: 8 px too wide and 22 px too short. Resize it to 944 × 1310.
- Figma's PDF export treats 1 px as 1 pt, so this frame would come out about 333 mm wide. Export a PNG instead and place it at 80 × 111 mm, or scale the PDF to that size.

## Test print

Print one generated page, cut it to the trim, and check it against this list. A value that fails gets fixed in the generator, then in the Print spec table.

- [ ] The PDF's page size reads 74 × 105 mm
- [ ] Printed at 100% or "actual size", never "fit to page"
- [ ] "Pages per sheet" is 1. Any other value scales the page and voids the measurements below
- [ ] The grid measures 65.4 mm with a ruler, and is centred left to right
- [ ] After cutting, nothing sits closer than 4 mm to the left, right and bottom edges, the seed included
- [ ] Nothing is printed in the top 12 mm
- [ ] Every cell line is unbroken, and the tinted boxes are clearly visible but do not fight the digits
- [ ] 1 7, 6 9 and 3 8 are easy to tell apart at arm's length
- [ ] The seed can be read and retyped without a mistake
- [ ] A pencil digit written in a cell is comfortable at 7.3 mm, and reads clearly against both paper and tint

## Printing and binding

### How many pages fit an A4 sheet

Eight A7 pages tile an A4 sheet by area, because A7 is A4 halved three times. That tiling is edge to edge: two columns of 105 mm is exactly 210 mm, so the outer columns fall in the strip a home printer cannot reach, and they lose a box line and the seed. Four is the number that fits with room to cut.

| Per sheet | Layout                      | Margin left over                  | Use it for                             |
| --------- | --------------------------- | --------------------------------- | -------------------------------------- |
| 1         | Upright, centred            | Generous                          | Every test print                       |
| 4         | 2 × 2 upright, 148 × 210 mm | 31 mm sides, 43 mm top and bottom | Home printing                          |
| 8         | 2 × 4 rotated, 210 × 296 mm | None                              | A shop that prints oversized and trims |

Impose the sheet in the app, never with the print dialog's "pages per sheet". That control scales pages down to fit, so the grid stops measuring 65.4 mm and every check in the test print above stops meaning anything. It does not offer 8 in any case. The app lays out an A4 sheet holding four true-size pages, and the dialog stays at 100%, one sheet per sheet.

Keep all four pages upright rather than rotated, so every page on the sheet carries its binding zone at the top and a cut stack needs no sorting.

### Cutting

Pages tile with no gutter, so one cut serves two pages: three cuts each way on a four-page sheet, straight through. Cut the long way first, then across, so there are fewer pieces to hold square.

A blade has width, so two pages that share a cut split the difference. Half a millimetre of drift is fine against a 4 mm safe margin. Check the seed still clears the edge on the first sheet before cutting the rest.

Sheets are `print.html?sheet=4` for home printing and `?sheet=1` for a single test print, both on A4. Leaving `sheet` off gives bare A7 pages: that is the file for a print shop, and the only mode where the PDF's page size is the trim size.

### Binding

- Two-sided notebooks: print duplex with a flip on the long edge, so both sides keep the binding zone at the top.
- Four-up duplex: the long-edge flip mirrors the sheet left to right, so side B's columns have to be laid out in reverse, or the puzzle numbers land back to back with the wrong page. Check this on two sheets before running a whole notebook.
- Print shop: ask them to match the ink as a spot color. A bright orange loses saturation in standard four-color printing.
- Wire-o: confirm with whoever punches that 12 mm clears the holes, and punch one test cover before the full run.

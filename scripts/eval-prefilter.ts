import { loadDataset } from "../src/lib/eval/dataset";
import { evaluatePrefilter } from "../src/lib/eval/prefilter";

/**
 *   npm run eval:prefilter
 *
 * Runs the form-based noise prefilter (H13, ADR-0011) over the labeled dataset, without database
 * or API: posts discarded per rule, posts with pain it would lose (exit code 1 when any) and the
 * saving over the posts without pain.
 */

async function main() {
  const report = evaluatePrefilter(await loadDataset());
  if (report.total === 0) {
    console.error("No labeled posts. Run `npm run eval:sample` and label them at /labeling.");
    process.exitCode = 1;
    return;
  }

  console.log(`Posts etiquetados: ${report.total} (${report.withPain} con dolor, ${report.withoutPain} sin dolor)`);
  console.log(`Descartados por el prefiltro: ${report.discarded.length}`);
  for (const rule of report.byRule) console.log(`  ${rule.id} (${rule.label}): ${rule.count}`);
  for (const { item, rule } of report.discarded) console.log(`  - [${rule.id}] ${item.title ?? "(sin título)"}  ${item.url}`);

  console.log(`Posts con dolor perdidos: ${report.lost.length}`);
  for (const { item, rule } of report.lost) {
    console.log(`  ! [${rule.id}] ${item.id} ${item.title ?? "(sin título)"}  ${item.url}`);
  }

  const pct = report.savedPercent === null ? "—" : `${report.savedPercent} %`;
  console.log(`Ahorro: ${report.saved} de ${report.withoutPain} sin dolor (${pct})`);

  if (report.lost.length > 0) {
    console.error("El prefiltro descarta posts etiquetados con dolor: corrige o quita la regla.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

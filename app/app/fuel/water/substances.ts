import type { Substance } from './types'

/**
 * SUBSTANCE DATABASE — daily water bumps scale with the user's dose.
 *
 * For each entry:
 *   unit         — dose measurement unit (mg, pouches/day, drinks/day…)
 *   defaultDose  — typical adult therapeutic dose (just a starting value)
 *   mlPerUnit    — extra ml of water needed per 1 unit of dose
 *
 * Final water bump = dose × mlPerUnit. So 36mg Concerta → 36 × 13.9 ≈ 500ml.
 *
 * Numbers based on conservative reads of:
 *   - ADHD stim diuresis + reduced thirst signal (Adler/Wilens reviews)
 *   - Lithium narrow therapeutic window (Cooper 2014, NICE guidelines)
 *   - Thiazide / loop diuretic SE profiles
 *   - Alcohol diuresis (Hobson 2010 — ~10ml urine per gram ethanol)
 *
 * Ported verbatim from po-water.html — keep in sync if v1 ever changes.
 */
export const SUBSTANCE_DB: Substance[] = [
  { id: 'adderall',   name: 'Adderall (mixed amphetamine salts)',          cat: 'ADHD stim',    unit: 'mg',           defaultDose: 20,   mlPerUnit: 25,    note: 'Stim · reduces thirst signal · dries you out' },
  { id: 'concerta',   name: 'Concerta (methylphenidate ER)',               cat: 'ADHD stim',    unit: 'mg',           defaultDose: 36,   mlPerUnit: 13.9,  note: 'Stim · reduces thirst signal' },
  { id: 'vyvanse',    name: 'Vyvanse (lisdexamfetamine)',                  cat: 'ADHD stim',    unit: 'mg',           defaultDose: 50,   mlPerUnit: 10,    note: 'Stim prodrug · long acting' },
  { id: 'ritalin',    name: 'Ritalin IR (methylphenidate)',                cat: 'ADHD stim',    unit: 'mg',           defaultDose: 20,   mlPerUnit: 20,    note: 'Short-acting stim' },
  { id: 'focalin',    name: 'Focalin / Focalin XR',                        cat: 'ADHD stim',    unit: 'mg',           defaultDose: 20,   mlPerUnit: 20,    note: 'Methylphenidate isomer' },
  { id: 'modafinil',  name: 'Modafinil',                                   cat: 'Wakefulness',  unit: 'mg',           defaultDose: 200,  mlPerUnit: 1.75,  note: 'Mild dehydrating effect' },
  { id: 'lithium',    name: 'Lithium',                                     cat: 'Mood',         unit: 'mg',           defaultDose: 600,  mlPerUnit: 1.67,  note: 'Critical. Narrow therapeutic window, dehydration → toxicity' },
  { id: 'hctz',       name: 'Hydrochlorothiazide (HCTZ)',                  cat: 'Diuretic',     unit: 'mg',           defaultDose: 25,   mlPerUnit: 40,    note: 'Direct diuretic. Drink to compensate' },
  { id: 'lasix',      name: 'Furosemide (Lasix)',                          cat: 'Diuretic',     unit: 'mg',           defaultDose: 40,   mlPerUnit: 30,    note: 'Loop diuretic · talk to your doctor about target' },
  { id: 'spironol',   name: 'Spironolactone',                              cat: 'Diuretic',     unit: 'mg',           defaultDose: 50,   mlPerUnit: 12,    note: 'K-sparing diuretic' },
  { id: 'sudafed',    name: 'Pseudoephedrine (Sudafed)',                   cat: 'Decongestant', unit: 'mg',           defaultDose: 60,   mlPerUnit: 4.17,  note: 'Sympathomimetic · dries mucous membranes' },
  { id: 'phenyl',     name: 'Phenylephrine',                               cat: 'Decongestant', unit: 'mg',           defaultDose: 10,   mlPerUnit: 20,    note: 'Vasoconstrictor, mild' },
  { id: 'nicotine',   name: 'Nicotine pouch (Velo / Zyn)',                 cat: 'Stim',         unit: 'pouches/day',  defaultDose: 4,    mlPerUnit: 62.5,  defaultStrengthMg: 6, mlPerMg: 10.4, strengthOptions: [2, 3, 4, 6, 8, 10, 14], note: 'Vasoconstriction + dry mouth · pick the mg printed on your tin (Zyn 3/6 · Velo 4/7/10)' },
  { id: 'nicpatch',   name: 'Nicotine patch',                              cat: 'Stim',         unit: 'mg',           defaultDose: 14,   mlPerUnit: 18,    note: '24-h transdermal · sustained release' },
  { id: 'alcohol',    name: 'Alcohol',                                     cat: 'Depressant',   unit: 'drinks/day',   defaultDose: 1,    mlPerUnit: 400,   note: '~10ml urine per gram ethanol. Adds up fast' },
  { id: 'cannabis',   name: 'Cannabis / THC',                              cat: 'Other',        unit: 'sessions/day', defaultDose: 1,    mlPerUnit: 250,   note: 'Cottonmouth, saliva gland inhibition' },
  { id: 'creatine',   name: 'Creatine monohydrate',                        cat: 'Supplement',   unit: 'g/day',        defaultDose: 5,    mlPerUnit: 80,    note: 'Pulls water into muscle cells. Drink more' },
  { id: 'preworkout', name: 'Pre-workout (caffeine + others)',             cat: 'Stim',         unit: 'servings/day', defaultDose: 1,    mlPerUnit: 300,   note: 'High-stim formula on top of caffeine' },
  { id: 'metformin',  name: 'Metformin',                                   cat: 'Glucose',      unit: 'mg',           defaultDose: 1000, mlPerUnit: 0.3,   note: 'Mild GI fluid loss' },
  { id: 'sertraline', name: 'SSRI (sertraline / escitalopram / fluoxetine)', cat: 'SSRI',       unit: 'mg',           defaultDose: 50,   mlPerUnit: 4,     note: 'Mild dry mouth in some users' },
  { id: 'wellbutrin', name: 'Bupropion (Wellbutrin)',                      cat: 'NDRI',         unit: 'mg',           defaultDose: 300,  mlPerUnit: 1.17,  note: 'Stim-like profile' },
]

# Zhezguys LQR Lab

A free website for **FIRST LEGO League Challenge** teams that use **SPIKE Prime + Pybricks**.
Made by team **Zhezguys**, who are known for accurate LQR turns and straight driving.

- **Real Pybricks code in the browser.** Python (Pyodide) runs the team's own code against a simulated hub, motors and gyro.
- **LQR vs PID vs the Pybricks gyro.** The three controllers run side by side on the same robot, with animations, charts and numbers, plus an accuracy ranking over 6 turns (±45°, ±90°, 180°, 30°) and 4 straight drives. Two modes: *as in my code* and *PID and gyro auto-tuned first*. The ranking comes out of the simulation and is never hard-coded.
- **Ready-to-code library.** `config.py` (ports, `CONTROLLER = "LQR"`, speed presets, the robot model written by the site), `helpers.py` (`straight()`, `turn()`, `turn_one()` that dispatch to the chosen controller; `turn()` angles add up in `TARGET`), `lqr.py` and `pid.py`. Programs 1–9 are separate tabs; `main.py` is assembled automatically with the hub menu (LEFT/RIGHT choose, CENTER runs, prg 0 shows the battery, Bluetooth button stops).
- **3D robot configurator (registration step 2 and the Robot page).** Teams build their robot in 3D (three.js) or a top view from a searchable catalog of about 90 LEGO / SPIKE Prime parts. Each part has its LEGO number, an English and Russian name, and a typical mass. Parts are dragged into place and raised or lowered in layers; pins, axles and gears are counted in a parts list. A team can correct the mass of any part it weighed, or enter the whole robot's weight from a kitchen scale. The site computes the mass, the 3D centre of mass, turning inertia and the weight on the drive wheels, and warns about tipping, wheel slip, a heavier side or a high centre of mass.
- **LQR that follows a plan.** `lqr_turn` and `lqr_straight` follow a trapezoid plan with model feed-forward and LQR feedback on [error, rate] (gains from the Riccati equation of the robot model in `config.py`), then hold the target with a small integral and friction compensation. The auto-tuner also tunes PID and the gyro DriveBase so the comparison is fair.
- **Calibration from a real robot.** A team runs a 1-second spin test on the hub and pastes the log. The simulator then fits its turning inertia and tyre scrub to that robot.
- **2362 × 1143 mm table planner** with three card modes: blank table, the full BIOGLOW mat, and missions only (FIRST's wireframe of the mission models with the mission numbers M01–M12). Drawing tools are pen, arrows, robot routes (with mm and turn angles), text, robot positions and zones. Each drawing belongs to Program 1, 2, 3…, and a drawn **route can be converted to code** (`turn()` + `straight()`).
- **Team accounts.** Step 1 asks for name, surname, team name, e-mail and password; step 2 is the robot builder. The first member creates the team and gets a 6-letter join code; teammates join with it. Only that team can see or edit its workspace.
- **Languages:** English, Русский and Қазақша, plus light and dark themes. The design is an editorial "milk & sky" look: milky paper, light-blue panels, navy ink, thin rules and numbered sections, with Oswald headlines and Manrope text (both cover Kazakh Cyrillic). The 3D parts (hub with light matrix, angular motors, sensors, liftarms with holes, frames, tyres with tread) can be painted in LEGO colours.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints. `npm test` runs the simulator, tuner and code-helper tests, and `npm run build` makes the static site in `dist/`.

## Accounts: browser-only or cloud

By default, accounts and workspaces are stored **in the browser** (localStorage, salted PBKDF2 passwords). That needs no setup, but data stays on one computer.

To give every team real cloud accounts with server-side protection, use Supabase (the free tier is enough):

1. Create a project at supabase.com.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, Row Level Security rules (a team can only read and write its own workspace) and the `create_team` / `join_team` functions.
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
   For GitHub Pages, add the same two names as **repository secrets**.
4. Rebuild. The site switches to cloud mode automatically.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.
Turn it on once: repository **Settings → Pages → Source: GitHub Actions**.

## BIOGLOW mat and missions

The competition table is 2362 × 1143 mm. The BIOGLOW (Founders Edition) mat is smaller: the official *Wireframe & Path Diagram* uses 20 cm squares, 10 across, so the mat is about 2000 × 1140 mm. The site places it at real size against the bottom (team-side) wall, centred left to right. All of this is set by `MAT` in [`src/field/bioglow.ts`](src/field/bioglow.ts); if your measured mat differs, change those numbers.

- `public/mats/bioglow.jpg` is the full mat. It is a cleaned-up copy of a small screenshot, so replace it with a high-resolution export of the official mat when you have one (keep the same name).
- `public/mats/bioglow-wireframe.png` is the "Missions" card, cropped from FIRST's wireframe PDF.
- The mission numbers M01–M12 (M10 has two spots) and the quarter-circle launch areas (radius ≈ 481 mm) were measured from those files.

## How the simulator works

- The Pybricks `DriveBase` model follows Pybricks' behaviour: trapezoid profiles, PID with a reduced gain near the target, and a maneuver that counts as done once the error is inside the motors' 10° / 50 °/s target tolerance. A `turn()` followed by `stop()` therefore keeps whatever error was left, as on the real hub.
- `src/sim/physics.ts`: a differential-drive robot with SPIKE motor torque/speed curves (medium: 185 rpm and 18 N·cm stall; large: 175 rpm and 25 N·cm), battery voltage, motor and wheel mismatch, rolling resistance, tyre scrub and stick-slip friction (that's why `Minpower` matters), plus a gyro with slow noise and drift.
  It also models Pybricks-like closed-loop motors and `DriveBase` (trapezoid profiles + PID, `use_gyro`).
  Time only moves when the program calls the hub (`wait()`, motor calls…), like MicroPython on a real hub, so runs are deterministic.
- `src/sim/py/pybricks/`: a simulated `pybricks` package with `PrimeHub`, `Motor`, `DriveBase`, `StopWatch`, `wait`, sensors and more. Team code runs unchanged.
- `src/tuning/`: the models `dω/dt = YAW_A·ω + YAW_B·u` and `dv/dt = LIN_A·v + LIN_B·u` are derived from the robot profile and written into `config.py`; `lqr.py` solves the 2×2 Riccati equation on the hub (Bryson weights). `WHEEL_D` is the average rolling diameter of both tyres. Nelder–Mead search tunes the PID gains and a grid search the gyro turn rate.
  The JS twins in `controllers.ts` mirror the Python functions call by call.

The simulator is a model. Real robots also have gear backlash, wheel slip and mat bumps.
The calibration test closes most of the gap for turning.

## Project layout

```
src/
  code/defaults.ts      starter code: config.py, helpers.py, lqr.py (Zhezguys LQR), pid.py
  sim/                  physics, Pyodide runner, web worker, simulated pybricks package
  tuning/               LQR/PID/DriveBase auto-tuner and real-robot calibration
  field/                table size, BIOGLOW mat position, missions, route → code
  robot/                robot builder model + LEGO parts catalog (parts → mass, centre of mass, inertia)
  components/builder/   3D configurator (react-three-fiber) and catalog panel
  components/           table canvas, charts, code editor, arenas
  pages/                Landing, Auth, Table, Code, Robot, Compare, Team
  storage/              browser-only and Supabase adapters
  i18n/                 en / ru / kk
supabase/schema.sql     cloud database + security rules
```

## Tools installed for development

- **UI UX Pro Max** skill: in `.claude/skills/ui-ux-pro-max` (MIT, from nextlevelbuilder/ui-ux-pro-max-skill). Claude Code loads it automatically in this repo.
- **Motion** (`motion` on npm): used for the page animations, and it respects "reduce motion".
- **21st MCP** (formerly Magic MCP): configured in `.mcp.json`. It needs your own key from 21st.dev/mcp in the environment variable `API_KEY_21ST`.

FIRST®, FIRST® LEGO® League, SPIKE™ and Pybricks are trademarks of their respective owners. This project is not affiliated with them.

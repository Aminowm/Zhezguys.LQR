# Zhezguys LQR Lab

A free website for **FIRST LEGO League Challenge** teams that use **SPIKE Prime + Pybricks**.
Made by team **Zhezguys**, who are known for accurate LQR turns and straight driving.

- **Real Pybricks code in the browser.** Python (Pyodide) runs the team's own code against a simulated hub, motors and gyro.
- **LQR vs PID vs the Pybricks gyro.** The three controllers run side by side on the same robot, with animations, charts and numbers.
- **Robot interpreter and auto-tuner.** A team enters its robot (mass, size, wheels, motors…). The site solves the LQR Riccati equation for that robot, refines the gains in simulation and writes them into the team's code with one click.
- **Calibration from a real robot.** A team runs a 1-second spin test on the hub and pastes the log. The simulator then fits its turning inertia and tyre scrub to that robot.
- **2362 × 1143 mm table planner** with three card modes: blank table, BIOGLOW full card, and missions only. Drawing tools are pen, arrows, robot routes (with mm and turn angles), text, robot positions and zones. Each drawing belongs to Program 1, 2, 3…, and a drawn **route can be converted to code** (`turn_lqr` + `straight_lqr`).
- **Team accounts.** Fields are name, surname, team name, e-mail and password. The first member creates the team and gets a 6-letter join code; teammates join with it. Only that team can see or edit its workspace.
- **Languages:** English, Русский and Қазақша, plus light and dark themes.

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

The official mat art and mission positions are not in the repo yet.

- Put the mat picture at `public/mats/bioglow.png`. The BIOGLOW card mode uses it automatically.
- Mission markers (M01…M15) and launch areas are in [`src/field/bioglow.ts`](src/field/bioglow.ts), in table millimetres.
  Until those are filled in, teams can drag markers in the table page (**Move mission markers**) and use **Export layout** to get the JSON.

## How the simulator works

- `src/sim/physics.ts`: a differential-drive robot with SPIKE motor torque/speed curves (medium: 185 rpm and 18 N·cm stall; large: 175 rpm and 25 N·cm), battery voltage, motor and wheel mismatch, rolling resistance, tyre scrub and stick-slip friction (that's why `Minpower` matters), plus a gyro with slow noise and drift.
  It also models Pybricks-like closed-loop motors and `DriveBase` (trapezoid profiles + PID, `use_gyro`).
  Time only moves when the program calls the hub (`wait()`, motor calls…), like MicroPython on a real hub, so runs are deterministic.
- `src/sim/py/pybricks/`: a simulated `pybricks` package with `PrimeHub`, `Motor`, `DriveBase`, `StopWatch`, `wait`, sensors and more. Team code runs unchanged.
- `src/tuning/`: the yaw model `dω/dt = a·ω + b·u` is derived from the robot profile. The 2×2 Riccati solution gives `K1`, `K2` (Bryson weights), and Nelder–Mead search over the real control loop refines them for turns of 90°, −45°, 180° and 30°.
  The JS twins in `controllers.ts` mirror the Python functions call by call.

The simulator is a model. Real robots also have gear backlash, wheel slip and mat bumps.
The calibration test closes most of the gap for turning.

## Project layout

```
src/
  code/defaults.ts      starter code: config.py, helpers.py, lqr.py (Zhezguys LQR), pid.py
  sim/                  physics, Pyodide runner, web worker, simulated pybricks package
  tuning/               LQR/PID/DriveBase auto-tuner and real-robot calibration
  field/                table size, BIOGLOW layout, route → code
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

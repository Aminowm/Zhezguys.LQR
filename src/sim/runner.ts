// Runs a team's Pybricks program inside Pyodide against the simulator.
// Shared by the browser web worker and the Node test suite.

import { Pose, Sim, SimResult, StopMode, isMatchTimeOver } from "./physics";
import { PortName, RobotProfile } from "./robot";
import initPy from "./py/pybricks/__init__.py?raw";
import parametersPy from "./py/pybricks/parameters.py?raw";
import toolsPy from "./py/pybricks/tools.py?raw";
import hubsPy from "./py/pybricks/hubs.py?raw";
import pupdevicesPy from "./py/pybricks/pupdevices.py?raw";
import roboticsPy from "./py/pybricks/robotics.py?raw";
import umathPy from "./py/umath.py?raw";
import urandomPy from "./py/urandom.py?raw";
import runnerPy from "./py/zg_runner.py?raw";

export interface RunJob {
  code: string;
  profile: RobotProfile;
  start: Pose;
  seed?: number;
  maxTimeMs?: number;
  walls?: boolean;
}

export interface RunError {
  type: string;
  msg: string;
  line: number | null;
}

export interface RunOutput extends SimResult {
  runError?: RunError;
  timeOver?: boolean;
  /** program clock when the Python code finished (before the robot comes to rest) */
  programEndMs: number;
}

// Minimal structural type for the parts of Pyodide we use.
export interface PyodideLike {
  FS: { mkdirTree(p: string): void; writeFile(p: string, data: string): void };
  registerJsModule(name: string, mod: object): void;
  runPython(code: string): unknown;
  globals: { get(name: string): any };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

const stop = (s: string): StopMode =>
  s === "coast" || s === "brake" || s === "hold" || s === "none" ? s : "hold";

export class Runner {
  private sim: Sim | null = null;
  private runFn: any;

  constructor(py: PyodideLike) {
    const root = "/home/pyodide/zg";
    py.FS.mkdirTree(root + "/pybricks");
    const files: Record<string, string> = {
      "pybricks/__init__.py": initPy,
      "pybricks/parameters.py": parametersPy,
      "pybricks/tools.py": toolsPy,
      "pybricks/hubs.py": hubsPy,
      "pybricks/pupdevices.py": pupdevicesPy,
      "pybricks/robotics.py": roboticsPy,
      "umath.py": umathPy,
      "urandom.py": urandomPy,
      "zg_runner.py": runnerPy,
    };
    for (const [p, src] of Object.entries(files)) py.FS.writeFile(`${root}/${p}`, src);
    py.registerJsModule("_sim", this.bridge());
    py.setStdout({ batched: (s) => this.sim?.log("print", s) });
    py.setStderr({ batched: (s) => this.sim?.log("error", s) });
    py.runPython(`import sys\nif '${root}' not in sys.path: sys.path.insert(0, '${root}')\nfrom zg_runner import zg_run`);
    this.runFn = py.globals.get("zg_run");
  }

  private s(): Sim {
    if (!this.sim) throw new Error("simulator not running");
    return this.sim;
  }

  private bridge() {
    const self = this;
    const c = () => self.s().callCost();
    const waitDone = (pred: () => boolean, timeout = 20000) => {
      self.s().advanceUntil(pred, timeout);
    };
    return {
      now: () => self.s().now(),
      cost: () => c(),
      wait: (ms: number) => {
        c();
        self.s().advance(Math.max(0, ms));
      },
      event: (kind: string, text: string) => {
        c();
        self.s().log(kind === "beep" ? "beep" : "display", text);
      },
      battery_mv: () => 7200 + 11 * self.s().p.batteryPct,
      ultrasonic: () => {
        c();
        return self.s().ultrasonic();
      },
      gyro_heading: () => {
        c();
        return self.s().gyroHeading();
      },
      gyro_reset: (a: number) => {
        c();
        self.s().gyroReset(a);
      },
      gyro_rate: () => {
        c();
        return self.s().gyroRateZ();
      },
      motor_new: (port: PortName, dir: string) => {
        c();
        self.s().motor(port, dir === "counterclockwise" ? "counterclockwise" : "clockwise");
      },
      motor_angle: (port: PortName) => {
        c();
        return self.s().getMotor(port).userAngle();
      },
      motor_speed: (port: PortName) => {
        c();
        return self.s().getMotor(port).userSpeed();
      },
      motor_stalled: (port: PortName) => self.s().motorStalled(port),
      motor_reset_angle: (port: PortName, a: number) => {
        c();
        self.s().motorResetAngle(port, a);
      },
      motor_stop: (port: PortName, how: string) => {
        c();
        self.s().motorStop(port, how === "brake" ? "brake" : "coast");
      },
      motor_hold: (port: PortName) => {
        c();
        self.s().motorHold(port);
      },
      motor_dc: (port: PortName, d: number) => {
        c();
        self.s().motorDc(port, d);
      },
      motor_run: (port: PortName, sp: number) => {
        c();
        self.s().motorRun(port, sp);
      },
      motor_run_time: (port: PortName, sp: number, ms: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.motorRun(port, sp, sim.t + ms / 1000, stop(then));
        if (wait) waitDone(() => sim.motorDone(port), ms + 2000);
      },
      motor_run_angle: (port: PortName, sp: number, ang: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.motorRunAngle(port, sp, ang, stop(then));
        if (wait) waitDone(() => sim.motorDone(port));
      },
      motor_run_target: (port: PortName, sp: number, target: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.motorRunTarget(port, sp, target, stop(then));
        if (wait) waitDone(() => sim.motorDone(port));
      },
      motor_run_until_stalled: (port: PortName, sp: number, then: string) => {
        c();
        const sim = self.s();
        sim.motorRun(port, sp);
        const ok = sim.advanceUntil(() => sim.motorStalled(port), 1500);
        if (!ok) sim.log("info", `run_until_stalled on port ${port}: no mechanical stop in the simulator, stopped after 1.5 s`);
        sim.motorStop(port, stop(then) === "brake" ? "brake" : "coast");
        if (stop(then) === "hold") sim.motorHold(port);
        return sim.getMotor(port).userAngle();
      },
      motor_done: (port: PortName) => {
        c();
        return self.s().motorDone(port);
      },
      db_new: (l: PortName, r: PortName, wd: number, at: number) => {
        c();
        self.s().driveBase(l, r, wd, at);
      },
      db_straight: (dist: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.dbStraight(dist, stop(then));
        if (wait) waitDone(() => sim.dbDone());
      },
      db_turn: (a: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.dbTurn(a, stop(then));
        if (wait) waitDone(() => sim.dbDone());
      },
      db_curve: (r: number, a: number, then: string, wait: boolean) => {
        c();
        const sim = self.s();
        sim.dbCurve(r, a, stop(then));
        if (wait) waitDone(() => sim.dbDone());
      },
      db_drive: (sp: number, rate: number) => {
        c();
        self.s().dbDrive(sp, rate);
      },
      db_stop: (how: string) => {
        c();
        self.s().dbStop(how === "brake" ? "brake" : "coast");
      },
      db_distance: () => {
        c();
        return self.s().dbDistance();
      },
      db_angle: () => {
        c();
        return self.s().dbAngle();
      },
      db_state: () => {
        c();
        const sim = self.s();
        const db = sim.db!;
        const vl = (db.left.userSpeed() / 360) * Math.PI * db.wheelD;
        const vr = (db.right.userSpeed() / 360) * Math.PI * db.wheelD;
        return [Math.round(sim.dbDistance()), Math.round((vl + vr) / 2), Math.round(sim.dbAngle()), Math.round(((vl - vr) / db.axle) * 57.2958)];
      },
      db_reset: () => {
        c();
        self.s().dbReset();
      },
      db_done: () => {
        c();
        return self.s().dbDone();
      },
      db_use_gyro: (on: boolean) => {
        c();
        self.s().dbUseGyro(on);
      },
      db_settings: (ss: number, sa: number, tr: number, ta: number) => {
        c();
        const st = self.s().db!.settings;
        if (ss >= 0) st.straight_speed = ss;
        if (sa >= 0) st.straight_acceleration = sa;
        if (tr >= 0) st.turn_rate = tr;
        if (ta >= 0) st.turn_acceleration = ta;
      },
      db_get_settings: () => {
        const st = self.s().db!.settings;
        return [st.straight_speed, st.straight_acceleration, st.turn_rate, st.turn_acceleration];
      },
    };
  }

  run(job: RunJob): RunOutput {
    const sim = new Sim({
      profile: job.profile,
      start: job.start,
      seed: job.seed,
      maxTimeMs: job.maxTimeMs,
      walls: job.walls,
    });
    this.sim = sim;
    let runError: RunError | undefined;
    let timeOver = false;
    try {
      const res = String(this.runFn(job.code, "<program>") ?? "");
      if (res === "MATCH_TIME_OVER") timeOver = true;
      else if (res) runError = JSON.parse(res);
    } catch (e) {
      if (isMatchTimeOver(e)) timeOver = true;
      else runError = { type: "InternalError", msg: String((e as Error)?.message ?? e), line: null };
    }
    const programEndMs = sim.now();
    // let the robot come to rest so coasting after the program is visible
    try {
      if (!timeOver) {
        sim.maxTimeMs = Math.max(sim.maxTimeMs, sim.now() + 1000);
        sim.advance(600);
      }
    } catch {
      /* ignore */
    }
    if (timeOver) sim.log("info", "Program stopped: time limit reached");
    if (runError) sim.log("error", `${runError.type}: ${runError.msg}${runError.line ? ` (line ${runError.line})` : ""}`);
    const out: RunOutput = { ...sim.result(runError?.msg), runError, timeOver, programEndMs };
    this.sim = null;
    return out;
  }
}

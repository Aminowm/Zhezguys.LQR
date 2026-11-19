// Starter code every new team gets (Zhezguys style). When a program runs on
// the table — or is exported for the hub — the files are joined in this order:
// config → helpers → lqr → pid → program. Export also adds the hub menu
// (prg 0 = battery, prg 1–9 = your programs, LEFT/RIGHT choose, CENTER runs).

export type CodeFileId = "config" | "helpers" | "lqr" | "pid";

export const FILE_ORDER: CodeFileId[] = ["config", "helpers", "lqr", "pid"];

export const FILE_NAMES: Record<CodeFileId, string> = {
  config: "config.py",
  helpers: "helpers.py",
  lqr: "lqr.py",
  pid: "pid.py",
};

export const MAX_PROGRAMS = 9;

export const DEFAULT_FILES: Record<CodeFileId, string> = {
  config: `from pybricks.hubs import PrimeHub
from pybricks.parameters import Axis, Button, Color, Direction, Port, Stop
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
from pybricks.tools import StopWatch, wait
from umath import sqrt

hub = PrimeHub()
hub.system.set_stop_button(Button.BLUETOOTH)  # CENTER is used by the program menu

left = Motor(Port.B, Direction.COUNTERCLOCKWISE)
right = Motor(Port.F)
tool_left = Motor(Port.A)
tool_right = Motor(Port.E)

# What drives straight(), turn() and turn_one(): "LQR", "PID" or "GYRO"
CONTROLLER = "LQR"

# Robot model — the site rewrites the lines marked "site" from your 3D robot
WHEEL_D = 88  # mm, site
AXLE = 112  # mm, site
YAW_A = -5.83  # 1/s, site
YAW_B = 50.2  # deg/s2 per %, site
LIN_A = -8.72  # 1/s, site
LIN_B = 73.3  # mm/s2 per %, site
U_TURN0 = 10.3  # % to start turning, site
U_DRIVE0 = 6.7  # % to start rolling, site

GYRO_TIMEOUT_MS = 2000  # menu: wait until the robot stands still
GYRO_WAIT_MS = 200

# Speed presets: straight(500, **NORMAL)
FAST = dict(vmax=85, acc=500, kd=1.0)
NORMAL = dict(vmax=65, acc=400, kd=0.8)
SLOW = dict(vmax=45, acc=300, kd=0.7)
CRAWL = dict(vmax=30, acc=250, kd=0.6)

drive = DriveBase(left, right, wheel_diameter=WHEEL_D, axle_track=AXLE)
drive.use_gyro(True)
GYRO_TURN_RATE = 180  # deg/s at ulim=100 (CONTROLLER = "GYRO")
GYRO_TURN_ACC = 720  # deg/s2
`,
  helpers: `TARGET = 0.0  # heading to hold (deg); turn() adds to it


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def heading_rate():
    # clockwise turn rate in deg/s (same sign as hub.imu.heading())
    return -hub.imu.angular_velocity(Axis.Z)


def mm_per_deg():
    return 3.14159265 * WHEEL_D / 360


def top_speed():
    # mm/s at 100 % power, from the robot model
    return -LIN_B * 100 / LIN_A


def battery_percent():
    return int(clamp((hub.battery.voltage() - 7000) / 14, 0, 100))


# ───── write every program with these three ─────

def straight(dist, vmax=65, acc=400, kd=0.8):
    # dist in mm (negative = backwards), vmax in % of top speed,
    # acc in mm/s2, kd = how hard the heading is damped (1.0 = full)
    if CONTROLLER == "LQR":
        lqr_straight(dist, vmax, acc, kd)
    elif CONTROLLER == "PID":
        pid_straight(dist, vmax, acc, kd)
    else:
        gyro_straight(dist, vmax, acc)


def turn(angle, ulim=100):
    # turn by angle degrees (+ = right), counted from the last target
    global TARGET
    TARGET += angle
    if CONTROLLER == "LQR":
        lqr_turn(TARGET, ulim)
    elif CONTROLLER == "PID":
        pid_turn(TARGET, ulim)
    else:
        gyro_turn(TARGET, ulim)


def turn_one(angle, pivot="left", ulim=90):
    # turn on one wheel; pivot="left" keeps the left wheel still
    global TARGET
    TARGET += angle
    if CONTROLLER == "LQR":
        lqr_turn(TARGET, ulim, pivot)
    elif CONTROLLER == "PID":
        pid_turn(TARGET, ulim, pivot)
    else:
        gyro_turn_one(TARGET, pivot, ulim)


# ───── Pybricks DriveBase with the gyro (CONTROLLER = "GYRO") ─────

def gyro_straight(dist, vmax=65, acc=400):
    drive.settings(straight_speed=vmax / 100 * top_speed(), straight_acceleration=acc)
    drive.straight(dist)
    drive.stop()


def gyro_turn(target, ulim=100):
    drive.settings(turn_rate=GYRO_TURN_RATE * ulim / 100, turn_acceleration=GYRO_TURN_ACC)
    drive.turn(target - hub.imu.heading())
    drive.stop()


def gyro_turn_one(target, pivot="left", ulim=90):
    # one wheel drives until the gyro reaches the target
    wheel = right if pivot == "left" else left
    (left if pivot == "left" else right).hold()
    sign = 1 if target > hub.imu.heading() else -1
    power = ulim * 0.5 * sign * (-1 if pivot == "left" else 1)
    sw = StopWatch()
    while (target - hub.imu.heading()) * sign > 0 and sw.time() < 4000:
        wheel.dc(power)
        wait(5)
    wheel.brake()


def move_mm(dist, power=60):
    # no gyro at all: the same power on both wheels
    deg = abs(dist) / mm_per_deg()
    s = 1 if dist >= 0 else -1
    left.reset_angle(0)
    right.reset_angle(0)
    while (abs(left.angle()) + abs(right.angle())) / 2 < deg:
        left.dc(power * s)
        right.dc(power * s)
        wait(10)
    left.brake()
    right.brake()
`,
  lqr: `# ───── LQR ─────
# The robot is a model:   turning  dw/dt = YAW_A*w + YAW_B*u
#                         driving  dv/dt = LIN_A*v + LIN_B*u
# lqr_gains() solves the Riccati equation of that model, so the gains fit YOUR
# robot's weight, size and motors. *_E_MAX / *_RATE_MAX = the error you accept
# (Bryson's rule): smaller = stiffer.

TURN_E_MAX = 6.0  # deg
TURN_RATE_MAX = 300.0  # deg/s
TURN_TOL = 0.2  # deg: finished when closer than this...
TURN_SETTLE = 100  # ms ...for this long
DRIVE_E_MAX = 8.0  # mm behind / ahead of the plan
DRIVE_V_MAX = 200.0  # mm/s
HOLD_E_MAX = 2.0  # deg heading error while driving
HOLD_RATE_MAX = 120.0  # deg/s


def lqr_gains(a, b, e_max, rate_max, u_max):
    # x = [error, error rate], u = K1*error + K2*rate  (closed-form Riccati)
    q1 = 1 / (e_max * e_max)
    q2 = 1 / (rate_max * rate_max)
    r = 1 / (u_max * u_max)
    k1 = sqrt(q1 / r)
    p2 = sqrt(q1 * r) / b
    k2 = (a + sqrt(a * a + (b * b / r) * (2 * p2 + q2))) / b
    return k1, k2


def lqr_turn(target, ulim=100, pivot=None, timeout=4000):
    # turn until hub.imu.heading() == target; pivot="left"/"right" = on one wheel
    b = YAW_B / 2 if pivot else YAW_B
    k1, k2 = lqr_gains(YAW_A, b, TURN_E_MAX, TURN_RATE_MAX, ulim)
    ki = 2.0 * k1  # integral removes the last tenths of a degree
    u0 = U_TURN0 * (1.6 if pivot else 1.0)  # this robot's static friction
    if pivot == "left":
        left.hold()
    elif pivot == "right":
        right.hold()
    integ = 0.0
    settled = 0
    sw = StopWatch()
    last = sw.time()
    while sw.time() < timeout:
        now = sw.time()
        dt = (now - last) / 1000
        last = now
        e = target - hub.imu.heading()
        w = heading_rate()
        integ = clamp(integ + e * dt, -2, 2) if abs(e) < 2 else 0.0
        u = k1 * e - k2 * w + ki * integ + u0 * e / (abs(e) + 0.3)
        u = clamp(u, -ulim, ulim)
        if abs(e) <= TURN_TOL and abs(w) < 4:
            settled += dt * 1000
            u = 0
            if settled >= TURN_SETTLE:
                break
        else:
            settled = 0
        if pivot == "left":
            right.dc(-u)
        elif pivot == "right":
            left.dc(u)
        else:
            left.dc(u)
            right.dc(-u)
        wait(5)
    left.hold()
    right.hold()


def lqr_straight(dist, vmax=65, acc=400, kd=0.8, timeout=10000):
    # follows a smooth speed plan and corrects distance, speed and heading at once
    s = 1 if dist >= 0 else -1
    D = abs(dist)
    top = vmax / 100 * top_speed()
    ks1, ks2 = lqr_gains(LIN_A, LIN_B, DRIVE_E_MAX, DRIVE_V_MAX, 60)
    kh1, kh2 = lqr_gains(YAW_A, YAW_B, HOLD_E_MAX, HOLD_RATE_MAX, 40)
    t_acc = top / acc
    d_acc = 0.5 * acc * t_acc * t_acc
    if 2 * d_acc > D:
        t_acc = sqrt(D / acc)
        top = acc * t_acc
        d_acc = D / 2
    t_end = 2 * t_acc + (D - 2 * d_acc) / top
    k = mm_per_deg()
    left.reset_angle(0)
    right.reset_angle(0)
    sw = StopWatch()
    while sw.time() < timeout:
        t = sw.time() / 1000
        if t < t_acc:
            p, v_ref, a_ref = 0.5 * acc * t * t, acc * t, acc
        elif t < t_end - t_acc:
            p, v_ref, a_ref = d_acc + top * (t - t_acc), top, 0
        elif t < t_end:
            td = t_end - t
            p, v_ref, a_ref = D - 0.5 * acc * td * td, acc * td, -acc
        else:
            p, v_ref, a_ref = D, 0, 0
        pos = s * (left.angle() + right.angle()) / 2 * k
        vel = s * (left.speed() + right.speed()) / 2 * k
        u_ff = (a_ref - LIN_A * v_ref) / LIN_B + (U_DRIVE0 if v_ref > 0 else 0)
        u = s * clamp(u_ff + ks1 * (p - pos) + ks2 * (v_ref - vel), -100, 100)
        e = TARGET - hub.imu.heading()
        uh = clamp(kh1 * e - kd * kh2 * heading_rate(), -40, 40)
        left.dc(clamp(u + uh, -100, 100))
        right.dc(clamp(u - uh, -100, 100))
        if t >= t_end and abs(p - pos) < 1.0 and abs(vel) < 15:
            break
        if t > t_end + 1.5:
            break
        wait(5)
    left.hold()
    right.hold()
`,
  pid: `# ───── PID — the classic way most teams write it ─────
PID_KP = 3.0
PID_KI = 0.0
PID_KD = 0.15
PID_MINPOWER = 12
PID_TOL = 1.0  # deg
PID_SETTLE = 150  # ms

HOLD_KP = 2.0  # heading PID while driving straight
HOLD_KI = 0.0
HOLD_KD = 0.05
DRIVE_MINPOWER = 20


def pid_turn(target, ulim=100, pivot=None, timeout=3000):
    sw = StopWatch()
    last = sw.time()
    last_e = target - hub.imu.heading()
    integ = 0
    settled = 0
    if pivot == "left":
        left.hold()
    elif pivot == "right":
        right.hold()
    while sw.time() < timeout:
        now = sw.time()
        dt = (now - last) / 1000
        e = target - hub.imu.heading()
        d = 0
        if dt > 0:
            integ = clamp(integ + e * dt, -30, 30)
            d = (e - last_e) / dt
        u = clamp(PID_KP * e + PID_KI * integ + PID_KD * d, -ulim, ulim)
        if abs(e) > PID_TOL and abs(u) < PID_MINPOWER:
            u = PID_MINPOWER if u >= 0 else -PID_MINPOWER
        if abs(e) <= PID_TOL and abs(d) < 15:
            settled += now - last
            u = 0
            if settled >= PID_SETTLE:
                break
        else:
            settled = 0
        if pivot == "left":
            right.dc(-u)
        elif pivot == "right":
            left.dc(u)
        else:
            left.dc(u)
            right.dc(-u)
        last_e = e
        last = now
        wait(10)
    left.brake()
    right.brake()


def pid_straight(dist, vmax=65, acc=400, kd=0.8, timeout=10000):
    # power ramps up and down, PID keeps the heading, brakes at the distance
    deg = abs(dist) / mm_per_deg()
    s = 1 if dist >= 0 else -1
    ramp = max(60, (vmax / 100 * top_speed()) ** 2 / (2 * acc) / mm_per_deg())
    left.reset_angle(0)
    right.reset_angle(0)
    sw = StopWatch()
    last = sw.time()
    last_e = TARGET - hub.imu.heading()
    integ = 0
    while sw.time() < timeout:
        now = sw.time()
        dt = (now - last) / 1000
        traveled = (abs(left.angle()) + abs(right.angle())) / 2
        if traveled >= deg:
            break
        up = DRIVE_MINPOWER + (vmax - DRIVE_MINPOWER) * min(1, traveled / ramp)
        down = DRIVE_MINPOWER + (vmax - DRIVE_MINPOWER) * min(1, (deg - traveled) / ramp)
        base = min(vmax, up, down) * s
        e = TARGET - hub.imu.heading()
        d = 0
        if dt > 0:
            integ = clamp(integ + e * dt, -20, 20)
            d = (e - last_e) / dt
        u = clamp(HOLD_KP * e + HOLD_KI * integ + HOLD_KD * kd * d, -40, 40)
        left.dc(base + u)
        right.dc(base - u)
        last_e = e
        last = now
        wait(10)
    left.brake()
    right.brake()
`,
};

export const DEFAULT_PROGRAM = `# prg 1 — example run: drive out, turn, use the left tool, come back
straight(500, **NORMAL)
turn(-90)
straight(380, **NORMAL)
tool_left.run_angle(500, 180)
straight(-380, **NORMAL)
turn(90)
straight(-500, **NORMAL)
`;

export const emptyProgram = (n: number) => `# prg ${n}\n`;

/** Lines that start every program, on the table and on the hub. */
const START = `hub.imu.reset_heading(0)\nTARGET = 0.0\n`;

export function buildProgram(files: Record<CodeFileId, string>, program: string) {
  const parts: string[] = [];
  const map: { file: string; start: number; lines: number }[] = [];
  let line = 1;
  const push = (name: string, src: string) => {
    const text = src.endsWith("\n") ? src : src + "\n";
    const header = `# ───── ${name} ─────\n`;
    parts.push(header + text);
    const n = text.split("\n").length - 1;
    map.push({ file: name, start: line + 1, lines: n });
    line += n + 1;
  };
  for (const id of FILE_ORDER) push(FILE_NAMES[id], files[id] ?? DEFAULT_FILES[id]);
  push("start", START);
  push("program", program);
  return {
    code: parts.join(""),
    locate(l: number | null) {
      if (!l) return null;
      for (const m of map) if (l >= m.start && l < m.start + m.lines) return { file: m.file, line: l - m.start + 1 };
      return null;
    },
  };
}

const indent = (src: string, pad: string) => {
  const lines = src.replace(/\s+$/, "").split("\n");
  const body = lines.filter((l) => l.trim() && !l.trim().startsWith("#")).length ? lines : [...lines, "pass"];
  return body.map((l) => (l.trim() ? pad + l : "")).join("\n");
};

/** One file for the hub: library + menu (prg 0 = battery, prg 1–9 = programs). */
export function buildHubProgram(files: Record<CodeFileId, string>, programs: { name: string; code: string }[]) {
  const list = programs.slice(0, MAX_PROGRAMS);
  const pad = "                ";
  const branches = list
    .map((p, i) => `            elif prg == ${i + 1}:  # ${p.name.replace(/\n/g, " ")}\n${indent(p.code, pad)}`)
    .join("\n\n");
  const menu = `# ───── menu: LEFT / RIGHT choose, CENTER runs ─────
prg = 0
max_prg = ${list.length}

while True:
    hub.display.char(str(prg))
    pressed = hub.buttons.pressed()

    if Button.RIGHT in pressed:
        prg = (prg + 1) % (max_prg + 1)
        while Button.RIGHT in hub.buttons.pressed():
            wait(10)

    elif Button.LEFT in pressed:
        prg = (prg - 1) % (max_prg + 1)
        while Button.LEFT in hub.buttons.pressed():
            wait(10)

    elif Button.CENTER in pressed:
        while Button.CENTER in hub.buttons.pressed():
            wait(10)

        hub.display.char("-")

        left.stop()
        right.stop()
        sw0 = StopWatch()
        while not hub.imu.stationary() and sw0.time() < GYRO_TIMEOUT_MS:
            wait(10)
        wait(GYRO_WAIT_MS)
        hub.imu.reset_heading(0)
        TARGET = 0.0

        try:
            # ---------- 0: BATTERY ----------
            if prg == 0:
                mv = hub.battery.voltage()
                pct = battery_percent()
                print("Battery: %d mV (%d %%)" % (mv, pct))
                hub.display.number(pct)
                wait(3000)

${branches || "            pass"}

            print("Heading error: %.2f deg" % (hub.imu.heading() - TARGET))
        except SystemExit:
            print("\\n[!] STOPPED WITH THE BLUETOOTH BUTTON\\n")

        left.hold()
        right.hold()
        tool_left.brake()
        tool_right.brake()
        wait(500)
`;
  const lib = FILE_ORDER.map((id) => `# ───── ${FILE_NAMES[id]} ─────\n${files[id] ?? DEFAULT_FILES[id]}`).join("\n");
  return lib.replace(/\s+$/, "") + "\n\n\n" + menu;
}

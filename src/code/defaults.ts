// Starter code every new team gets. It is Zhezguys' own SPIKE Prime code,
// split into files. When a program runs (or is exported for the hub) the
// files are joined in this order: config → helpers → lqr → pid → program.

export type CodeFileId = "config" | "helpers" | "lqr" | "pid";

export const FILE_ORDER: CodeFileId[] = ["config", "helpers", "lqr", "pid"];

export const FILE_NAMES: Record<CodeFileId, string> = {
  config: "config.py",
  helpers: "helpers.py",
  lqr: "lqr.py",
  pid: "pid.py",
};

export const DEFAULT_FILES: Record<CodeFileId, string> = {
  config: `from pybricks.hubs import PrimeHub
from pybricks.parameters import Button, Port, Side, Stop, Direction
from pybricks.tools import wait, run_task, StopWatch
from pybricks.pupdevices import Motor
from pybricks.robotics import DriveBase
from math import sqrt

hub = PrimeHub()
hub.system.set_stop_button(Button.CENTER)
motor_B = Motor(Port.B, Direction.COUNTERCLOCKWISE)
motor_F = Motor(Port.F)
motor_E = Motor(Port.E)
motor_A = Motor(Port.A)

Drive_base = DriveBase(motor_B, motor_F, wheel_diameter=88, axle_track=112)
Drive_base.use_gyro(True)
Drive_base.settings(turn_rate=60 * 3.6)
timer_move = StopWatch()
`,
  helpers: `SIGN = 1  # 1 or -1: flips the direction of the one-wheel turn


def Gyro():
    return hub.imu.heading()


def Gyro_reset(angle=0):
    hub.imu.reset_heading(angle)


def angle_error(target, current):
    # shortest way from current to target, between -180 and 180
    return (target - current + 180) % 360 - 180


def map_value(x, in_min, in_max, out_min, out_max):
    if in_max == in_min:
        return out_max
    x = max(min(x, max(in_min, in_max)), min(in_min, in_max))
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min


def move_deg(Power_B, Power_F, Deg, Brake=True):
    motor_B.reset_angle(0)
    motor_F.reset_angle(0)
    while (abs(motor_B.angle()) + abs(motor_F.angle())) / 2 < Deg:
        motor_B.dc(Power_B)
        motor_F.dc(Power_F)
        wait(10)
    motor_B.dc(0)
    motor_F.dc(0)
    if Brake:
        motor_B.brake()
        motor_F.brake()


def move_time(Power_B, Power_F, ms, Brake=True):
    timer_move.reset()
    while timer_move.time() < ms:
        motor_B.dc(Power_B)
        motor_F.dc(Power_F)
    if Brake:
        Drive_base.stop()


def a_motor(Power, Deg, is_wait=True):
    motor_A.run_angle(Power * 11, Deg, wait=is_wait)


def turn_gyro(hdg, Brake=True):
    # Pybricks built-in DriveBase turn with the hub gyro (relative angle)
    Drive_base.settings(turn_rate=50 * 3.6)
    Drive_base.turn(hdg)
    if Brake:
        Drive_base.stop()


def straight_gyro(mm, Brake=True):
    # Pybricks built-in DriveBase straight with the hub gyro
    Drive_base.straight(mm)
    if Brake:
        Drive_base.stop()
`,
  lqr: `def lqr_gains(Q, R, b, kd=0.08):
    K1 = sqrt(Q / R) / b
    K2 = kd
    return K1, K2


def turn_lqr(GyroDeg, Q=1, R=0.01, b=2, kd=0.08,
             Maxpower=80, Minpower=12,
             Tolerance=1.0, Settle=150, Timeout=3000, Brake=True):
    K1 = sqrt(Q / R) / b
    K2 = kd
    timer = StopWatch()
    total = StopWatch()
    last_time = timer.time()
    last_error = GyroDeg - Gyro()
    error_rate = 0
    settled = 0
    while total.time() < Timeout:
        now = timer.time()
        dt = (now - last_time) / 1000
        error = GyroDeg - Gyro()
        if dt > 0:
            raw_rate = (error - last_error) / dt
            error_rate = 0.7 * error_rate + 0.3 * raw_rate
        u = K1 * error + K2 * error_rate
        u = max(-Maxpower, min(Maxpower, u))
        if abs(error) > Tolerance and abs(u) < Minpower:
            u = Minpower if u >= 0 else -Minpower
        if abs(error) <= Tolerance and abs(error_rate) < 15:
            settled += now - last_time
            u = 0
            if settled >= Settle:
                break
        else:
            settled = 0
        motor_B.dc(u)
        motor_F.dc(-u)
        last_error = error
        last_time = now
        wait(10)
    if Brake:
        Drive_base.stop()
    else:
        motor_B.dc(0)
        motor_F.dc(0)


def turnl_lqr(GyroDeg, Q=1.5, R=0.01, b=2, kd=0.11,
              Maxpower=75, Minpower=15,
              Tolerance=1.5, Settle=150, Timeout=3000, Brake=True):
    # turn with one wheel (the right wheel, motor F)
    K1 = sqrt(Q / R) / b
    K2 = kd
    timer = StopWatch()
    total = StopWatch()
    last_time = timer.time()
    last_error = angle_error(GyroDeg, Gyro())
    error_rate = 0
    settled = 0
    while total.time() < Timeout:
        now = timer.time()
        dt = (now - last_time) / 1000
        error = angle_error(GyroDeg, Gyro())
        if dt > 0:
            raw_rate = (error - last_error) / dt
            error_rate = 0.7 * error_rate + 0.3 * raw_rate
        u = K1 * error + K2 * error_rate
        u = max(-Maxpower, min(Maxpower, u))
        if abs(error) > Tolerance and abs(u) < Minpower:
            u = Minpower if u >= 0 else -Minpower
        if abs(error) <= Tolerance and abs(error_rate) < 15:
            settled += now - last_time
            u = 0
            if settled >= Settle:
                break
        else:
            settled = 0
        motor_F.dc(SIGN * (-u))
        last_error = error
        last_time = now
        wait(10)
    if Brake:
        motor_F.brake()
        Drive_base.stop()
    else:
        motor_F.dc(0)


def straight_lqr(Deg, Power=60, GyroDeg=None, Q=1, R=0.01, b=4, kd=0.04,
                 Minpower=20, Accel=150, Decel=250, Timeout=8000, Brake=True):
    # Drive Deg motor degrees in a straight line; LQR holds the heading GyroDeg.
    # Negative Power drives backwards.
    if GyroDeg is None:
        GyroDeg = Gyro()
    K1 = sqrt(Q / R) / b
    K2 = kd
    direction = 1 if Power >= 0 else -1
    Power = abs(Power)
    Deg = abs(Deg)
    motor_B.reset_angle(0)
    motor_F.reset_angle(0)
    timer = StopWatch()
    last_time = timer.time()
    last_error = GyroDeg - Gyro()
    error_rate = 0
    while timer.time() < Timeout:
        now = timer.time()
        dt = (now - last_time) / 1000
        traveled = (abs(motor_B.angle()) + abs(motor_F.angle())) / 2
        if traveled >= Deg:
            break
        up = Minpower + (Power - Minpower) * min(1, traveled / Accel)
        down = Minpower + (Power - Minpower) * min(1, (Deg - traveled) / Decel)
        base = min(Power, up, down) * direction
        error = GyroDeg - Gyro()
        if dt > 0:
            raw_rate = (error - last_error) / dt
            error_rate = 0.7 * error_rate + 0.3 * raw_rate
        u = K1 * error + K2 * error_rate
        u = max(-40, min(40, u))
        motor_B.dc(base + u)
        motor_F.dc(base - u)
        last_error = error
        last_time = now
        wait(10)
    motor_B.dc(0)
    motor_F.dc(0)
    if Brake:
        motor_B.brake()
        motor_F.brake()
`,
  pid: `def turn_pid(GyroDeg, Kp=3.0, Ki=0.0, Kd=0.15,
             Maxpower=80, Minpower=12,
             Tolerance=1.0, Settle=150, Timeout=3000, Brake=True):
    # Classic PID on the gyro heading (no filter on the derivative)
    timer = StopWatch()
    last_time = timer.time()
    last_error = GyroDeg - Gyro()
    integral = 0
    settled = 0
    while timer.time() < Timeout:
        now = timer.time()
        dt = (now - last_time) / 1000
        error = GyroDeg - Gyro()
        derivative = 0
        if dt > 0:
            integral += error * dt
            integral = max(-30, min(30, integral))
            derivative = (error - last_error) / dt
        u = Kp * error + Ki * integral + Kd * derivative
        u = max(-Maxpower, min(Maxpower, u))
        if abs(error) > Tolerance and abs(u) < Minpower:
            u = Minpower if u >= 0 else -Minpower
        if abs(error) <= Tolerance and abs(derivative) < 15:
            settled += now - last_time
            u = 0
            if settled >= Settle:
                break
        else:
            settled = 0
        motor_B.dc(u)
        motor_F.dc(-u)
        last_error = error
        last_time = now
        wait(10)
    if Brake:
        Drive_base.stop()
    else:
        motor_B.dc(0)
        motor_F.dc(0)


def straight_pid(Deg, Power=60, GyroDeg=None, Kp=2.0, Ki=0.0, Kd=0.05,
                 Minpower=20, Accel=150, Decel=250, Timeout=8000, Brake=True):
    # Drive straight Deg motor degrees; PID holds the heading
    if GyroDeg is None:
        GyroDeg = Gyro()
    direction = 1 if Power >= 0 else -1
    Power = abs(Power)
    Deg = abs(Deg)
    motor_B.reset_angle(0)
    motor_F.reset_angle(0)
    timer = StopWatch()
    last_time = timer.time()
    last_error = GyroDeg - Gyro()
    integral = 0
    while timer.time() < Timeout:
        now = timer.time()
        dt = (now - last_time) / 1000
        traveled = (abs(motor_B.angle()) + abs(motor_F.angle())) / 2
        if traveled >= Deg:
            break
        up = Minpower + (Power - Minpower) * min(1, traveled / Accel)
        down = Minpower + (Power - Minpower) * min(1, (Deg - traveled) / Decel)
        base = min(Power, up, down) * direction
        error = GyroDeg - Gyro()
        derivative = 0
        if dt > 0:
            integral += error * dt
            integral = max(-20, min(20, integral))
            derivative = (error - last_error) / dt
        u = Kp * error + Ki * integral + Kd * derivative
        u = max(-40, min(40, u))
        motor_B.dc(base + u)
        motor_F.dc(base - u)
        last_error = error
        last_time = now
        wait(10)
    motor_B.dc(0)
    motor_F.dc(0)
    if Brake:
        motor_B.brake()
        motor_F.brake()
`,
};

export const DEFAULT_PROGRAM = `# Program 1 — write your run here.
# Heading 0 = the direction the robot faces at the start.
Gyro_reset(0)
straight_lqr(700, 60, 0)
turn_lqr(-90)
straight_lqr(500, 60, -90)
a_motor(50, 180)
straight_lqr(500, -60, -90)
turn_lqr(0)
straight_lqr(700, -60, 0)
`;

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

import _sim
from pybricks.parameters import Direction, Stop, Color


class _Control:
    def limits(self, speed=None, acceleration=None, torque=None):
        return (1000, 2000, 200)

    def pid(self, *args, **kwargs):
        return (0, 0, 0, 0, 0)

    def target_tolerances(self, speed=None, position=None):
        return (50, 10)

    def stall_tolerances(self, speed=None, time=None):
        return (20, 200)


class _Model:
    def state(self):
        return (0, 0, 0, False)

    def settings(self, *args):
        return ()


class Motor:
    def __init__(self, port, positive_direction=Direction.CLOCKWISE, gears=None, reset_angle=True, profile=None):
        self.port = port
        self.control = _Control()
        self.model = _Model()
        _sim.motor_new(port, positive_direction)

    # measuring
    def angle(self):
        return int(round(_sim.motor_angle(self.port)))

    def speed(self, window=100):
        return int(round(_sim.motor_speed(self.port)))

    def load(self):
        return 0

    def stalled(self):
        return bool(_sim.motor_stalled(self.port))

    def reset_angle(self, angle=None):
        _sim.motor_reset_angle(self.port, 0.0 if angle is None else float(angle))

    # stopping
    def stop(self):
        _sim.motor_stop(self.port, "coast")

    def brake(self):
        _sim.motor_stop(self.port, "brake")

    def hold(self):
        _sim.motor_hold(self.port)

    # running
    def dc(self, duty):
        _sim.motor_dc(self.port, float(duty))

    def run(self, speed):
        _sim.motor_run(self.port, float(speed))

    def run_time(self, speed, time, then=Stop.HOLD, wait=True):
        _sim.motor_run_time(self.port, float(speed), float(time), then, bool(wait))

    def run_angle(self, speed, rotation_angle, then=Stop.HOLD, wait=True):
        _sim.motor_run_angle(self.port, float(speed), float(rotation_angle), then, bool(wait))

    def run_target(self, speed, target_angle, then=Stop.HOLD, wait=True):
        _sim.motor_run_target(self.port, float(speed), float(target_angle), then, bool(wait))

    def run_until_stalled(self, speed, then=Stop.COAST, duty_limit=None):
        return int(_sim.motor_run_until_stalled(self.port, float(speed), then))

    def track_target(self, target_angle):
        _sim.motor_run_target(self.port, 1000.0, float(target_angle), Stop.HOLD, False)

    def done(self):
        return bool(_sim.motor_done(self.port))

    def settings(self, *args, **kwargs):
        return ()

    def close(self):
        _sim.motor_stop(self.port, "coast")


class DCMotor(Motor):
    pass


class ColorSensor:
    def __init__(self, port):
        self.port = port

    def color(self, surface=True):
        _sim.cost()
        return Color.WHITE

    def reflection(self):
        _sim.cost()
        return 60

    def ambient(self):
        _sim.cost()
        return 20

    def hsv(self, surface=True):
        _sim.cost()
        return Color(0, 0, 100)

    def detectable_colors(self, colors=None):
        return ()

    def lights(self):
        return None


class UltrasonicSensor:
    def __init__(self, port):
        self.port = port
        self.lights = _Lights()

    def distance(self):
        return int(_sim.ultrasonic())

    def presence(self):
        return False


class _Lights:
    def on(self, brightness=100):
        pass

    def off(self):
        pass


class ForceSensor:
    def __init__(self, port):
        self.port = port

    def force(self):
        _sim.cost()
        return 0.0

    def distance(self):
        return 0.0

    def pressed(self, force=3):
        _sim.cost()
        return False

    def touched(self):
        _sim.cost()
        return False

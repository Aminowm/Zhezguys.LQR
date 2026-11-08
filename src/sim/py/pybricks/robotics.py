import _sim
from pybricks.parameters import Stop


class _Ctl:
    def limits(self, *args, **kwargs):
        return (0, 0, 0)

    def pid(self, *args, **kwargs):
        return (0, 0, 0, 0, 0)

    def target_tolerances(self, *args, **kwargs):
        return (0, 0)

    def stall_tolerances(self, *args, **kwargs):
        return (0, 0)


class DriveBase:
    def __init__(self, left_motor, right_motor, wheel_diameter, axle_track):
        self.left = left_motor
        self.right = right_motor
        self.distance_control = _Ctl()
        self.heading_control = _Ctl()
        _sim.db_new(left_motor.port, right_motor.port, float(wheel_diameter), float(axle_track))

    def straight(self, distance, then=Stop.HOLD, wait=True):
        _sim.db_straight(float(distance), then, bool(wait))

    def turn(self, angle, then=Stop.HOLD, wait=True):
        _sim.db_turn(float(angle), then, bool(wait))

    def curve(self, radius, angle, then=Stop.HOLD, wait=True):
        _sim.db_curve(float(radius), float(angle), then, bool(wait))

    def arc(self, radius, angle=None, distance=None, then=Stop.HOLD, wait=True):
        if angle is None:
            angle = distance / (2 * 3.14159265 * abs(radius)) * 360
        _sim.db_curve(float(radius), float(angle), then, bool(wait))

    def drive(self, speed, turn_rate):
        _sim.db_drive(float(speed), float(turn_rate))

    def stop(self):
        _sim.db_stop("coast")

    def brake(self):
        _sim.db_stop("brake")

    def distance(self):
        return int(round(_sim.db_distance()))

    def angle(self):
        return int(round(_sim.db_angle()))

    def state(self):
        s = _sim.db_state()
        return tuple(s.to_py()) if hasattr(s, "to_py") else tuple(s)

    def reset(self, distance=0, angle=0):
        _sim.db_reset()

    def done(self):
        return bool(_sim.db_done())

    def stalled(self):
        return False

    def use_gyro(self, use_gyro):
        _sim.db_use_gyro(bool(use_gyro))

    def settings(self, straight_speed=None, straight_acceleration=None, turn_rate=None, turn_acceleration=None):
        if straight_speed is None and straight_acceleration is None and turn_rate is None and turn_acceleration is None:
            s = _sim.db_get_settings()
            return tuple(s.to_py()) if hasattr(s, "to_py") else tuple(s)
        _sim.db_settings(
            -1.0 if straight_speed is None else float(straight_speed),
            -1.0 if straight_acceleration is None else float(straight_acceleration),
            -1.0 if turn_rate is None else float(turn_rate),
            -1.0 if turn_acceleration is None else float(turn_acceleration),
        )


class GyroDriveBase(DriveBase):
    def __init__(self, left_motor, right_motor, wheel_diameter, axle_track):
        DriveBase.__init__(self, left_motor, right_motor, wheel_diameter, axle_track)
        self.use_gyro(True)


class Car:
    def __init__(self, steer_motor, drive_motors, torque_limit=100):
        raise NotImplementedError("Car is not supported in the simulator")

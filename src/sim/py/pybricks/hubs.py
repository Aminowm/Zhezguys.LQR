import _sim
from pybricks.parameters import Side, Axis


class _IMU:
    def heading(self):
        return _sim.gyro_heading()

    def reset_heading(self, angle=0):
        _sim.gyro_reset(float(angle))

    def angular_velocity(self, axis=None, calibrated=True):
        z = _sim.gyro_rate()
        if axis is None:
            return (0.0, 0.0, z)
        return z if axis == Axis.Z else 0.0

    def acceleration(self, axis=None, calibrated=True):
        if axis is None:
            return (0.0, 0.0, 9810.0)
        return 9810.0 if axis == Axis.Z else 0.0

    def tilt(self, calibrated=True):
        _sim.cost()
        return (0, 0)

    def up(self, calibrated=True):
        return Side.TOP

    def ready(self):
        return True

    def stationary(self):
        return abs(_sim.gyro_rate()) < 1.0

    def rotation(self, axis, calibrated=True):
        return -_sim.gyro_heading() if axis == Axis.Z else 0.0

    def orientation(self):
        return ((1, 0, 0), (0, 1, 0), (0, 0, 1))

    def settings(self, *args, **kwargs):
        return None


class _Light:
    def on(self, color):
        _sim.event("display", "light " + str(color))

    def off(self):
        pass

    def blink(self, color, durations):
        pass

    def animate(self, colors, interval):
        pass


class _Display:
    def text(self, text, on=500, off=50):
        _sim.event("display", str(text))

    def number(self, number):
        _sim.event("display", str(number))

    def char(self, char):
        _sim.event("display", str(char))

    def icon(self, icon):
        _sim.event("display", str(icon))

    def off(self):
        pass

    def pixel(self, row, column, brightness=100):
        pass

    def orientation(self, up):
        pass

    def animate(self, matrices, interval):
        pass


class _Speaker:
    def beep(self, frequency=500, duration=100):
        _sim.event("beep", "beep %d Hz" % frequency)
        if duration and duration > 0:
            _sim.wait(float(duration))

    def play_notes(self, notes, tempo=120):
        _sim.event("beep", "notes")

    def volume(self, volume=None):
        return 100


class _Buttons:
    def pressed(self):
        _sim.cost()
        return set()


class _System:
    def set_stop_button(self, button):
        pass

    def name(self):
        return "Zhezguys Sim"

    def shutdown(self):
        raise SystemExit

    def storage(self, offset, read=None, write=None):
        return bytes(read or 0)

    def reset_reason(self):
        return 0

    def info(self):
        return {}


class _Battery:
    def voltage(self):
        return int(_sim.battery_mv())

    def current(self):
        return 150


class _Charger:
    def connected(self):
        return False

    def status(self):
        return 0


class PrimeHub:
    def __init__(self, top_side=Side.TOP, front_side=Side.FRONT, broadcast_channel=None, observe_channels=[]):
        self.imu = _IMU()
        self.light = _Light()
        self.display = _Display()
        self.speaker = _Speaker()
        self.buttons = _Buttons()
        self.system = _System()
        self.battery = _Battery()
        self.charger = _Charger()


InventorHub = PrimeHub
EssentialHub = PrimeHub

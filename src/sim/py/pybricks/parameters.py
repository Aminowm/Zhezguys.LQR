class Port:
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"


class Direction:
    CLOCKWISE = "clockwise"
    COUNTERCLOCKWISE = "counterclockwise"


class Stop:
    COAST = "coast"
    COAST_SMART = "coast"
    BRAKE = "brake"
    HOLD = "hold"
    NONE = "none"


class Button:
    CENTER = "center"
    LEFT = "left"
    RIGHT = "right"
    BLUETOOTH = "bluetooth"
    UP = "up"
    DOWN = "down"
    LEFT_PLUS = "left_plus"
    LEFT_MINUS = "left_minus"
    RIGHT_PLUS = "right_plus"
    RIGHT_MINUS = "right_minus"


class Side:
    TOP = "top"
    BOTTOM = "bottom"
    LEFT = "left"
    RIGHT = "right"
    FRONT = "front"
    BACK = "back"


class Axis:
    X = "x"
    Y = "y"
    Z = "z"


class Color:
    def __init__(self, h=0, s=0, v=0, name=None):
        self.h = h
        self.s = s
        self.v = v
        self.name = name

    def __eq__(self, other):
        return isinstance(other, Color) and (self.h, self.s, self.v) == (other.h, other.s, other.v)

    def __hash__(self):
        return hash((self.h, self.s, self.v))

    def __repr__(self):
        return "Color.%s" % self.name if self.name else "Color(h=%d, s=%d, v=%d)" % (self.h, self.s, self.v)

    def __mul__(self, k):
        return Color(self.h, self.s, int(self.v * k))

    def __truediv__(self, k):
        return Color(self.h, self.s, int(self.v / k))

    def __rshift__(self, k):
        return Color((self.h + k) % 360, self.s, self.v)


for _n, _hsv in {
    "NONE": (0, 0, 0), "BLACK": (0, 0, 10), "GRAY": (0, 0, 50), "WHITE": (0, 0, 100),
    "RED": (0, 100, 100), "ORANGE": (30, 100, 100), "BROWN": (30, 100, 50),
    "YELLOW": (60, 100, 100), "GREEN": (120, 100, 100), "CYAN": (180, 100, 100),
    "BLUE": (240, 100, 100), "VIOLET": (270, 100, 100), "MAGENTA": (300, 100, 100),
}.items():
    setattr(Color, _n, Color(*_hsv, name=_n))


class _IconMeta(type):
    def __getattr__(cls, name):
        return "Icon." + name


class Icon(metaclass=_IconMeta):
    pass

import _sim


def wait(time):
    _sim.wait(float(time))


class StopWatch:
    def __init__(self):
        self._t0 = _sim.now()
        self._paused_at = None

    def time(self):
        _sim.cost()
        now = self._paused_at if self._paused_at is not None else _sim.now()
        return int(now - self._t0)

    def reset(self):
        self._t0 = _sim.now()
        if self._paused_at is not None:
            self._paused_at = self._t0

    def pause(self):
        if self._paused_at is None:
            self._paused_at = _sim.now()

    def resume(self):
        if self._paused_at is not None:
            self._t0 += _sim.now() - self._paused_at
            self._paused_at = None


class Matrix:
    def __init__(self, rows):
        self.rows = rows


def vector(*args):
    return tuple(args)


def run_task(task=None):
    raise NotImplementedError("run_task/multitask (async code) is not supported in the simulator yet. Use normal functions.")


def multitask(*tasks, race=False):
    raise NotImplementedError("multitask is not supported in the simulator yet.")


def hub_menu(*symbols):
    return symbols[0] if symbols else None


def read_input_byte():
    return None

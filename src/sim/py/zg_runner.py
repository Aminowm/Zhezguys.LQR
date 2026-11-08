import json
import traceback


def zg_run(src, filename="<program>"):
    g = {"__name__": "__main__"}
    try:
        code = compile(src, filename, "exec")
        exec(code, g)
        return ""
    except SystemExit:
        return ""
    except BaseException as e:
        msg = str(e)
        if "MATCH_TIME_OVER" in msg:
            return "MATCH_TIME_OVER"
        line = None
        if isinstance(e, SyntaxError) and e.filename == filename:
            line = e.lineno
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == filename:
                line = fr.lineno
        name = type(e).__name__
        if name == "JsException":
            msg = msg.split("\n")[0]
        return json.dumps({"type": name, "msg": msg, "line": line})

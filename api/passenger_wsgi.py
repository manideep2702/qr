# Compatibility entrypoint for Webuzo/Passenger.
# Some control panels expect a module named 'passenger_wsgi.py' with a top-level
# WSGI callable named 'application'. Our main WSGI app lives in app.py.
try:
	# Prefer the explicit 'application' symbol if present
	from app import application as application  # type: ignore
except Exception:
	# Fallback to 'app' symbol (alias is defined in app.py)
	from app import app as application  # type: ignore





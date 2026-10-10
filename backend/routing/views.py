import json
import logging

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.core.exceptions import RequestDataTooBig
from django.views.decorators.http import require_GET, require_POST

from .errors import ProviderError, ValidationError
from .planning import build_plan
from .providers import geocode
from .validation import validate_plan

logger = logging.getLogger(__name__)


def error(message, code="validation_error", status=400, fields=None):
    return JsonResponse({"error": message, "code": code, "fields": fields or {}}, status=status)


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@require_GET
def places(request):
    query = request.GET.get("q", "").strip()
    if not 2 <= len(query) <= 100:
        return error("Enter a city or place name between 2 and 100 characters.", fields={"q": "Enter at least 2 characters."})
    try:
        return JsonResponse({"places": geocode(query)})
    except ProviderError as exc:
        logger.warning("Geocoding provider failed: %s", exc)
        return error(str(exc), "provider_error", 502)


@require_POST
def plan(request):
    if request.content_type != "application/json":
        return error("Send trip details as application/json.")
    try:
        data = json.loads(request.body)
        return JsonResponse(build_plan(validate_plan(data)), json_dumps_params={"allow_nan": False})
    except (json.JSONDecodeError, UnicodeDecodeError):
        return error("Trip details are not valid JSON.")
    except RequestDataTooBig:
        return error("Trip details exceed the request size limit.")
    except ValidationError as exc:
        return error(str(exc), fields=exc.fields)
    except ProviderError as exc:
        logger.warning("Trip provider failed: %s", exc)
        return error(str(exc), "provider_error", 502)


def api_not_found(request):
    return error("API endpoint not found.", status=404)


@require_GET
def frontend(request):
    index = settings.PROJECT_DIR / "frontend" / "dist" / "index.html"
    if index.exists():
        return FileResponse(index.open("rb"), content_type="text/html")
    return HttpResponse("RouteCast API is running. Start the Vite development server or build frontend/dist to serve the app.", content_type="text/plain")

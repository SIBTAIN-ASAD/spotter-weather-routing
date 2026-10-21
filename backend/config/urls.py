from django.urls import path, re_path
from fuel import views as fuel_views
from routing import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/places/", views.places),
    path("api/plan/", views.plan),
    path("api/fuel/places/", fuel_views.places),
    path("api/fuel/plan/", fuel_views.plan),
    re_path(r"^api/", views.api_not_found),
    re_path(r"^.*$", views.frontend),
]

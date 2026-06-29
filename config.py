import os

EMAIL_CONFIG = {
    "smtp_host":       os.environ.get("SMTP_HOST", "smtp.gmail.com"),
    "smtp_port":       int(os.environ.get("SMTP_PORT", "587")),
    "smtp_user":       os.environ.get("SMTP_USER", ""),
    "smtp_password":   os.environ.get("SMTP_PASSWORD", ""),
    "sender_email":    os.environ.get("SENDER_EMAIL", ""),
    "developer_email": os.environ.get("DEVELOPER_EMAIL", ""),
}

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
APPROVER_EMAIL       = os.environ.get("APPROVER_EMAIL", "")
GATEWAY_BASE_URL     = os.environ.get("GATEWAY_BASE_URL", "")

IT_BOT_URL     = os.environ.get("IT_BOT_URL", "")
IT_BOT_API_KEY = os.environ.get("IT_BOT_API_KEY", "")

# Fallback site list used when the systems table is empty or DB is unreachable.
_FALLBACK_DEFAULTS = {"is_windows_based": False, "is_task": False, "windows_launcher_url": None, "windows_manifest_url": None}

SITES_FALLBACK = [
    {**_FALLBACK_DEFAULTS, "id": "travel-expense", "name": "RGMC Travel And Expense Web", "category": "RGMC",
     "primary_url": "https://rgmc-portal-935246372408.asia-southeast1.run.app/login?returnUrl=%2F", "primary_label": "Primary",
     "backup_url": "http://portal.rgmcgroup.com:7171/", "backup_label": "Backup"},
    {**_FALLBACK_DEFAULTS, "id": "creatives", "name": "RGMC Creatives", "category": "RGMC",
     "primary_url": "https://rgmccreatives-935246372408.asia-southeast1.run.app/", "primary_label": "Primary",
     "backup_url": "http://portal.rgmcgroup.com:6060/", "backup_label": "Backup"},
    {**_FALLBACK_DEFAULTS, "id": "production", "name": "RGMC Production", "category": "RGMC",
     "primary_url": "https://rgmc-production-935246372408.asia-southeast1.run.app", "primary_label": "Open",
     "backup_url": "http://portal.rgmcgroup.com:8080/login?returnUrl=%2F", "backup_label": "Backup"},
    {**_FALLBACK_DEFAULTS, "id": "garment-attributes", "name": "RGMC Garment Attributes Checker AI", "category": "RGMC",
     "primary_url": "https://rgmc-attribute-checker-ai-935246372408.us-central1.run.app/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "inventory-app", "name": "RGMC Inventory Mobile App", "category": "RGMC",
     "primary_url": "https://drive.google.com/drive/folders/1uJxDnvHUz_s9qd6l0vs1tmmkoTMp8sFy?usp=drive_link", "primary_label": "Download APK",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "rgmc-consignment-app", "name": "RGMC Consignment Web App", "category": "RGMC",
     "primary_url": "https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "sbic-po-uploader", "name": "SBIC PO Uploader", "category": "SBIC",
     "primary_url": "https://po-uploader-935246372408.us-central1.run.app/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "sbic-invoice-separator", "name": "SBIC Invoice Separator", "category": "SBIC",
     "primary_url": "https://sbic-invoice-splitter-935246372408.europe-west1.run.app/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "sbic-ra-upload", "name": "SBIC RA Upload", "category": "SBIC",
     "primary_url": "https://ra-uploader-935246372408.us-central1.run.app/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-keywest", "name": "Keywest", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/KEYWEST", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-alvita-prod", "name": "Alvita Prod", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/ALVITA_PROD", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-covent-runway-prod", "name": "Covent Runway Prod", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/COVENT_RUNWAY_PROD", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-lgap-prod", "name": "LGAP Prod", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/LGAP_PROD", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-manila-taste", "name": "Manila Taste", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/MANILA_TASTE", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-richfield-live", "name": "Richfield Live", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/RICHFIELD_LIVE", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-other-comp-prod", "name": "Other Comp Prod", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/OTHER_COMP_PROD/WebClient/", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-suncoast-prod", "name": "Suncoast Prod", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/SUNCOAST_PROD", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-usgi-prod-live", "name": "USGI Prod Live", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/USGI_PROD_LIVE", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
    {**_FALLBACK_DEFAULTS, "id": "nav-usgi-lgap-uat", "name": "USGI LGAP UAT", "category": "NAV Sites",
     "primary_url": "http://portal.rgmcgroup.com:8088/USGI_LGAP_UAT", "primary_label": "Open",
     "backup_url": None, "backup_label": None},
]

HEALTH_CHECKS = [
    {
        "id": "rgmc-gcp-api",
        "name": "RGMC GCP API",
        "base_url": "https://rgmc-gcp-api-935246372408.asia-southeast1.run.app",
        "endpoints": [
            {"path": "/checkdb",        "label": "Database"},
            {"path": "/checkBigQuery",  "label": "BigQuery"},
        ],
    },
    {
        "id": "rgmc-inventory-api",
        "name": "RGMC Inventory API",
        "base_url": "https://rgmcinventoryapi-935246372408.asia-southeast1.run.app",
        "endpoints": [
            {"path": "/api/Health/connections", "label": "Connections", "parse_connections": True},
        ],
    },
    {
        "id": "rgmc-bc-api",
        "name": "RGMC BC API",
        "base_url": "https://rgmc-bc-api-prod-935246372408.asia-southeast1.run.app",
        "endpoints": [
            {"path": "/healthcheck/bc", "label": "Business Central", "parse_bc_status": True},
        ],
    },
]

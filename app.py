import os
from flask import Flask

from controllers.public import public_bp
from controllers.auth import auth_bp
from controllers.issues import issues_bp
from controllers.admin import admin_bp
from controllers.developer import developer_bp
from controllers.profile import profile_bp
from controllers.tasks import tasks_bp
from controllers.user_page import user_page_bp
from controllers.general_helpdesk import general_helpdesk_bp
from controllers.resolution import resolution_bp
from controllers.webhooks import webhooks_bp
from controllers.outages import outages_bp
from controllers.task_statuses import task_statuses_bp

_scheduler_started = False


def create_app() -> Flask:
    global _scheduler_started

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB max upload

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(issues_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(developer_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(user_page_bp)
    app.register_blueprint(general_helpdesk_bp)
    app.register_blueprint(resolution_bp)
    app.register_blueprint(webhooks_bp)
    app.register_blueprint(outages_bp)
    app.register_blueprint(task_statuses_bp)

    # Start background scheduler once per process (skip Flask reloader child)
    if not _scheduler_started and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        _scheduler_started = True
        from services.scheduler import start_scheduler
        start_scheduler(app)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)

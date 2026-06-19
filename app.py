from flask import Flask

from controllers.public import public_bp
from controllers.auth import auth_bp
from controllers.issues import issues_bp
from controllers.admin import admin_bp
from controllers.developer import developer_bp
from controllers.profile import profile_bp
from controllers.tasks import tasks_bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB max upload

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(issues_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(developer_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(tasks_bp)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)

"""`python -m arabic_nlp`: one process, one event loop, the model loaded once."""

import uvicorn

from .app import create_app
from .config import Settings

if __name__ == '__main__':
    uvicorn.run(create_app(Settings.from_env()), host='0.0.0.0', port=8790, access_log=False,  # noqa: S104
                log_level='warning', timeout_keep_alive=5, limit_concurrency=64)

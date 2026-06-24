from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    influx_url: str
    influx_token: str
    influx_org: str

    bind_host: str = "0.0.0.0"
    bind_port: int = 8085
    log_level: str = "info"

    def __repr__(self) -> str:
        return "Settings(influx_url=%r, influx_org=%r, influx_token=***)" % (
            self.influx_url,
            self.influx_org,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

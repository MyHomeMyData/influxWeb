from pydantic import BaseModel


class ImportRawResponse(BaseModel):
    written_count: int

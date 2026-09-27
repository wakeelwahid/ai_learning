from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: str = ""
    errors: Optional[List[str]] = None

    @classmethod
    def ok(cls, data: Any = None, message: str = "Success") -> "APIResponse":
        return cls(success=True, data=data, message=message)

    @classmethod
    def error(cls, message: str, errors: List[str] = None) -> "APIResponse":
        return cls(success=False, data=None, message=message, errors=errors or [message])


class PaginatedData(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int = 1
    per_page: int = 20
    pages: int = 1


class PaginatedResponse(APIResponse[PaginatedData[T]], Generic[T]):
    pass


# Usage:
#   return APIResponse.ok(data=my_object, message="Created successfully")
#   return APIResponse.error("Not found")
#   return JSONResponse(APIResponse.error("Unauthorized").model_dump(), status_code=401)

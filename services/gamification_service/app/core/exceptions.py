from fastapi import HTTPException, status


class InsufficientPointsError(HTTPException):
    def __init__(self, detail: str = "Insufficient EduPoints"):
        super().__init__(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=detail)


class AlreadyOwnedError(HTTPException):
    def __init__(self, detail: str = "Item already owned"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)

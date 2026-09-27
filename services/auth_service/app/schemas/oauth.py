from pydantic import BaseModel


class OAuthRedirectResponse(BaseModel):
    redirect_url: str
    provider: str


class GoogleTokenRequest(BaseModel):
    id_token: str


class OAuthExchangeRequest(BaseModel):
    code: str

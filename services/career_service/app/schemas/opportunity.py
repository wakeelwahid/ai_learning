"""Schemas for opportunities (jobs, scholarships, exams, internships, olympiads)."""
from datetime import date

from pydantic import BaseModel, Field, model_validator

from app.models.opportunity import OpportunityCategory


class OpportunityCreate(BaseModel):
    # Reuse the real OpportunityCategory enum (app/models/opportunity.py)
    # instead of a bare str — invalid values now fail schema validation (422)
    # instead of the route having to convert + catch ValueError by hand.
    category:            OpportunityCategory
    subcategory:         str = Field(max_length=80)
    title:               str = Field(max_length=200)
    organization:        str = Field(max_length=200)
    description:         str | None = None
    total_posts:         int | None = Field(default=None, ge=0)
    qualification:       str | None = Field(default=None, max_length=200)
    age_min:             int | None = Field(default=None, ge=0, le=120)
    age_max:             int | None = Field(default=None, ge=0, le=120)
    salary_min:          int | None = Field(default=None, ge=0)
    salary_max:          int | None = Field(default=None, ge=0)
    application_fee:     int | None = Field(default=None, ge=0)
    last_date:           date
    exam_date:           date | None = None
    selection_process:   list[str]  = []
    official_url:        str = Field(max_length=500)
    notification_pdf_url: str | None = Field(default=None, max_length=500)
    is_featured:         bool       = False

    @model_validator(mode="after")
    def _validate_ranges(self) -> "OpportunityCreate":
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError("age_min cannot be greater than age_max")
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min cannot be greater than salary_max")
        return self


class OpportunityUpdate(BaseModel):
    title:               str | None = Field(default=None, max_length=200)
    organization:        str | None = Field(default=None, max_length=200)
    description:         str | None = None
    total_posts:         int | None = Field(default=None, ge=0)
    qualification:       str | None = Field(default=None, max_length=200)
    age_min:             int | None = Field(default=None, ge=0, le=120)
    age_max:             int | None = Field(default=None, ge=0, le=120)
    salary_min:          int | None = Field(default=None, ge=0)
    salary_max:          int | None = Field(default=None, ge=0)
    application_fee:     int | None = Field(default=None, ge=0)
    last_date:           date | None = None
    exam_date:           date | None = None
    selection_process:   list[str] | None = None
    official_url:        str | None = Field(default=None, max_length=500)
    notification_pdf_url: str | None = Field(default=None, max_length=500)
    is_active:           bool | None = None
    is_featured:         bool | None = None

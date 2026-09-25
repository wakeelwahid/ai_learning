"""Schemas for the career catalog (career listing & detail)."""


from pydantic import BaseModel


class CareerOut(BaseModel):
    id:                str
    title:             str
    category:          str
    slug:              str
    overview:          str
    required_subjects: list[str]
    skills_required:   list[str]
    roadmap_steps:     list[dict]
    salary_range:      dict
    demand_level:      str
    top_colleges:      list[str]
    entrance_exams:    list[str]
    future_demand:     str | None
    icon:              str | None
    color:             str | None

    model_config = {"from_attributes": True}


class CareerListItem(BaseModel):
    id:           str
    title:        str
    category:     str
    slug:         str
    overview:     str
    demand_level: str
    icon:         str | None
    color:        str | None
    salary_range: dict

    model_config = {"from_attributes": True}

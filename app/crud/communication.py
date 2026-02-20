from app.crud.base import CRUDBase
from app.models.communication import Communication


class CRUDCommunication(CRUDBase):
    pass


communication = CRUDCommunication(Communication)

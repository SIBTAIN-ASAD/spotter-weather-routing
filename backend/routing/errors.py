class ValidationError(Exception):
    def __init__(self, message, fields=None):
        super().__init__(message)
        self.fields = fields or {}


class ProviderError(Exception):
    """A recoverable upstream failure safe to explain to the user."""

"""Deliver worker results to a retained QObject slot on the GUI thread."""
from PySide6.QtCore import QObject, Signal, Slot, QRunnable, QThreadPool, Qt

_active_jobs = set()

class ResultSignal(QObject):
    ready = Signal(object, object)

class Worker(QRunnable):
    def __init__(self, work, signals):
        super().__init__()
        self.work, self.signals = work, signals

    def run(self):
        result, error = None, None
        try:
            result = self.work()
        except Exception as exc:
            error = exc.with_traceback(None)
        finally:
            self.work = None
        self.signals.ready.emit(result, error)

class GuiJob(QObject):
    def __init__(self, owner, work, success, failure):
        super().__init__(owner)
        self.owner, self.success, self.failure = owner, success, failure
        self.signals = ResultSignal(self)
        self.signals.ready.connect(self.deliver, Qt.ConnectionType.QueuedConnection)
        self.worker = Worker(work, self.signals)

    @Slot(object, object)
    def deliver(self, result, error):
        try:
            if error is None:
                try:
                    self.success(result)
                except Exception as exc:
                    self.failure(exc)
            else:
                self.failure(error)
        finally:
            self.success = self.failure = None
            self.owner._jobs.discard(self)
            _active_jobs.discard(self)
            self.deleteLater()

def start_job(owner, work, success, failure):
    if not hasattr(owner, '_jobs'):
        owner._jobs = set()
    job = GuiJob(owner, work, success, failure)
    owner._jobs.add(job)
    _active_jobs.add(job)
    QThreadPool.globalInstance().start(job.worker)
    return job

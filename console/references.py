"""Native name/title pickers; opaque reference IDs remain internal."""
from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QComboBox, QListWidget, QListWidgetItem, QPushButton

class ReferencePicker(QWidget):
    changed = Signal()
    def __init__(self, collection, values, content, edit, single=False):
        super().__init__(); self.collection=collection;self.content=content;self.edit=edit;self.single=single;self.excluded=set()
        layout=QVBoxLayout(self);layout.setContentsMargins(0,0,0,0)
        self.control=QComboBox() if single else QListWidget()
        if single:
            self.control.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon);self.control.setMinimumContentsLength(20)
        else:
            self.control.setMinimumHeight(110);self.control.setMaximumHeight(180);self.control.setWordWrap(True);self.control.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        layout.addWidget(self.control)
        actions=QHBoxLayout();self.add_button=QPushButton('Tambah program…' if collection=='programs' else 'Tambah ketua…' if single else 'Tambah anggota…');self.edit_button=QPushButton('Ubah yang dipilih…')
        actions.addWidget(self.add_button);actions.addWidget(self.edit_button);actions.addStretch();layout.addLayout(actions)
        self.refresh(values)
        if single: self.control.currentIndexChanged.connect(lambda _index:self.changed.emit())
        else: self.control.itemChanged.connect(lambda _item:self.changed.emit())
        self.add_button.clicked.connect(lambda:self.open_editor(None));self.edit_button.clicked.connect(self.edit_current)
    def candidates(self):
        return [item for item in self.content[self.collection] if self.collection!='people' or item['group']=='member']
    def values(self):
        if self.single:return self.control.currentData() or None
        return [self.control.item(i).data(Qt.ItemDataRole.UserRole) for i in range(self.control.count()) if self.control.item(i).checkState()==Qt.CheckState.Checked]
    def refresh(self, values=None):
        if values is None:values=self.values()
        selected=[values] if self.single and values else ([] if self.single else list(values or []))
        options=self.candidates();known={item['id'] for item in options};self.control.blockSignals(True);self.control.clear()
        if self.single:self.control.addItem('Belum dipilih',None)
        for item in options:
            key=item['id'];caption=item.get('title') or item.get('name') or 'Nama belum diisi'
            if self.collection=='people':caption+=f" · {item['role']}"
            if key in self.excluded:continue
            self.append(caption,key,key in selected)
        for key in selected:
            if key not in known:self.append('Tidak ditemukan: '+key,key,True)
        self.control.blockSignals(False)
    def append(self, caption, key, selected):
        if self.single:
            self.control.addItem(caption,key)
            if selected:self.control.setCurrentIndex(self.control.count()-1)
        else:
            row=QListWidgetItem(caption);row.setData(Qt.ItemDataRole.UserRole,key);row.setFlags(row.flags()|Qt.ItemFlag.ItemIsUserCheckable);row.setCheckState(Qt.CheckState.Checked if selected else Qt.CheckState.Unchecked);self.control.addItem(row)
    def set_excluded(self, keys):
        before=self.values();self.excluded=set(keys);self.refresh()
        if self.values()!=before:self.changed.emit()
    def edit_current(self):
        key=self.control.currentData() if self.single else (self.control.currentItem().data(Qt.ItemDataRole.UserRole) if self.control.currentItem() else None)
        if key and any(item['id']==key for item in self.candidates()):self.open_editor(key)
    def open_editor(self, key):
        if not self.edit:return
        def done(new_id):
            if self.single:self.refresh(new_id)
            else:self.refresh(list(dict.fromkeys([*self.values(),new_id])))
            self.changed.emit()
        self.edit(self.collection,key,done,self.single)

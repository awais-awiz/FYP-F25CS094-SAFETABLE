import { useState, useEffect } from "react";
import { 
  Plus, Edit, Trash2, CheckCircle2, XCircle, Search, Save, X, Image as ImageIcon, Box, Upload, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

// Assume menuApi and uploadApi are added to src/lib/api.js
import { menuApi, uploadApi } from "@/lib/api";

const MenuManagementPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    image_url: "",
    model_3d_url: "",
    is_available: true
  });

  const fetchMenu = async () => {
    try {
      setLoading(true);
      // Fetch all items, including unavailable ones, for management
      const data = await menuApi.list({ available_only: false });
      setItems(data.items || []);
    } catch (err) {
      toast.error("Failed to load menu items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const openDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || "",
        price: item.price,
        category: item.category,
        image_url: item.image_url || "",
        model_3d_url: item.model_3d_url || "",
        is_available: item.is_available
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "",
        image_url: "",
        model_3d_url: "",
        is_available: true
      });
    }
    setIsDialogOpen(true);
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (type === 'image') setUploadingImage(true);
      else setUploadingModel(true);

      const data = await uploadApi.uploadFile(file);
      
      if (type === 'image') {
        setFormData(prev => ({ ...prev, image_url: data.url }));
        toast.success("Image uploaded successfully");
      } else {
        setFormData(prev => ({ ...prev, model_3d_url: data.url }));
        toast.success("3D Model uploaded successfully");
      }
    } catch (err) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      if (type === 'image') setUploadingImage(false);
      else setUploadingModel(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        price: Number(formData.price)
      };

      if (editingItem) {
        await menuApi.update(editingItem._id, payload);
        toast.success("Menu item updated");
      } else {
        await menuApi.create(payload);
        toast.success("Menu item created");
      }
      setIsDialogOpen(false);
      fetchMenu();
    } catch (err) {
      toast.error(err.message || "Failed to save item");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this item? It will be removed from the active menu.")) return;
    try {
      await menuApi.remove(id);
      toast.success("Item deleted");
      fetchMenu();
    } catch (err) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Menu Management</h1>
          <p className="text-muted-foreground mt-1">Add, edit, or remove food items from your digital menu.</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2 rounded-xl shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4" /> Add New Item
        </Button>
      </div>

      <div className="flex items-center bg-background/50 backdrop-blur-md border border-border rounded-xl px-4 py-3 shadow-sm w-full max-w-md">
        <Search className="w-5 h-5 text-muted-foreground mr-3" />
        <input 
          type="text" 
          placeholder="Search by name or category..." 
          className="bg-transparent border-none outline-none w-full text-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <p className="text-muted-foreground col-span-full">Loading menu items...</p>
        ) : filteredItems.length === 0 ? (
          <p className="text-muted-foreground col-span-full">No items found.</p>
        ) : (
          filteredItems.map(item => (
            <Card key={item._id} className="overflow-hidden flex flex-col hover:border-primary/50 transition-colors shadow-sm">
              <div className="h-40 bg-muted relative border-b border-border">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8 opacity-50" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  <Badge className={item.is_available ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}>
                    {item.is_available ? "Available" : "Hidden"}
                  </Badge>
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-2 gap-2">
                  <h3 className="font-bold text-lg leading-tight truncate" title={item.name}>{item.name}</h3>
                  <span className="font-black text-primary whitespace-nowrap">Rs. {item.price}</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                  {item.description || "No description provided."}
                </p>
                
                <div className="flex gap-2 mt-auto pt-4 border-t border-border/50">
                  <Button variant="outline" size="sm" className="flex-1 text-blue-500 hover:text-blue-600 border-blue-500/30" onClick={() => openDialog(item)}>
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-red-500 hover:text-red-600 border-red-500/30" onClick={() => handleDelete(item._id)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{editingItem ? "Edit Menu Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Item Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Margherita Pizza" />
            </div>
            
            <div className="space-y-2">
              <Label>Price (PKR)</Label>
              <Input type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="e.g. 1500" />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="e.g. Mains, Desserts, Drinks" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Enter item description..." rows={3} />
            </div>

            <div className="space-y-2">
              <Label>Image URL / Path</Label>
              <div className="flex gap-2">
                <Input value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} placeholder="/uploads/..." />
                <div className="relative">
                  <Button type="button" variant="outline" disabled={uploadingImage} className="shrink-0 relative overflow-hidden">
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => handleFileUpload(e, 'image')}
                      disabled={uploadingImage}
                    />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Upload an image or paste a URL</p>
            </div>

            <div className="space-y-2">
              <Label>3D Model URL / Path</Label>
              <div className="flex gap-2">
                <Input value={formData.model_3d_url} onChange={e => setFormData({...formData, model_3d_url: e.target.value})} placeholder="/uploads/..." />
                <div className="relative">
                  <Button type="button" variant="outline" disabled={uploadingModel} className="shrink-0 relative overflow-hidden">
                    {uploadingModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <input 
                      type="file" 
                      accept=".glb,.gltf" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={(e) => handleFileUpload(e, 'model')}
                      disabled={uploadingModel}
                    />
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Upload a .glb file or paste a URL</p>
            </div>

            <div className="space-y-2 flex flex-col justify-center pt-6">
              <Label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-primary" 
                  checked={formData.is_available} 
                  onChange={e => setFormData({...formData, is_available: e.target.checked})} 
                />
                <span className="font-semibold">Item is Available</span>
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground font-bold">
              <Save className="w-4 h-4 mr-2" /> Save Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MenuManagementPage;

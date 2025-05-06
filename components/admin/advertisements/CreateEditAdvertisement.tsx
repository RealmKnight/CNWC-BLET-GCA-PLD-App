import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Platform, View, Image, ActivityIndicator, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import Toast from "react-native-toast-message";
import { DatePicker } from "@/components/DatePicker";
import { AdvertisementStatusToggle } from "./AdvertisementStatusToggle";
import { useUserStore } from "@/store/userStore";

interface CreateEditAdvertisementProps {
  advertisementId?: string;
  onSave: () => void;
}

export function CreateEditAdvertisement({ advertisementId, onSave }: CreateEditAdvertisementProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { member } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [advertisement, setAdvertisement] = useState({
    title: "",
    description: "",
    image_url: "",
    destination_url: "",
    file_type: "image",
    start_date: new Date(),
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
    status: "draft" as "draft" | "active" | "inactive",
    placement_locations: ["home", "notifications_top", "notifications_sidebar", "notifications_bottom"],
    target_devices: ["mobile", "web"],
    weight: 1,
  });

  useEffect(() => {
    if (advertisementId) {
      fetchAdvertisement(advertisementId);
    }
  }, [advertisementId]);

  const fetchAdvertisement = async (id: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from("advertisements").select("*").eq("id", id).single();

      if (error) throw error;

      if (data) {
        setAdvertisement({
          ...data,
          start_date: new Date(data.start_date),
          end_date: new Date(data.end_date),
        });
      }
    } catch (error) {
      console.error("Error fetching advertisement:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to load advertisement",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    if (Platform.OS === "web") {
      // Create a hidden file input element for web
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";

      // Handle file selection
      input.onchange = (event) => {
        const target = event.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          const file = target.files[0];
          const imageUrl = URL.createObjectURL(file);
          setImageFile(imageUrl);
        }
      };

      // Trigger the file dialog
      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    } else {
      // For native platforms, show a choice between camera and gallery
      Alert.alert("Choose Image Source", "Would you like to take a new photo or select from your gallery?", [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Take Photo",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
              setImageFile(result.assets[0].uri);
            }
          },
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [16, 9],
              quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
              setImageFile(result.assets[0].uri);
            }
          },
        },
      ]);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return advertisement.image_url;

    try {
      setIsUploadingImage(true);
      const fileExt = imageFile.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${advertisementId || "new"}/${fileName}`;

      // Different upload logic for web vs native
      if (Platform.OS === "web") {
        // For web, we need to fetch the file and use it directly
        const response = await fetch(imageFile);
        const blob = await response.blob();

        // Upload blob directly to Supabase Storage
        const { data, error } = await supabase.storage.from("advertisements").upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage.from("advertisements").getPublicUrl(filePath);
        return urlData.publicUrl;
      } else {
        // For native platforms, use FileSystem
        const fileContent = await FileSystem.readAsStringAsync(imageFile, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Upload file to Supabase Storage
        const { data, error } = await supabase.storage.from("advertisements").upload(filePath, fileContent, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage.from("advertisements").getPublicUrl(filePath);
        return urlData.publicUrl;
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to upload image",
      });
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validate form
      if (!advertisement.title || !advertisement.description) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Title and description are required",
        });
        return;
      }

      // Upload image if changed
      let imageUrl = advertisement.image_url;
      if (imageFile) {
        try {
          const uploadedUrl = await uploadImage();
          if (!uploadedUrl) {
            Toast.show({
              type: "error",
              text1: "Error",
              text2:
                Platform.OS === "web"
                  ? "Failed to upload image. Make sure you've selected a valid image file."
                  : "Failed to upload image",
            });
            return;
          }
          imageUrl = uploadedUrl;
        } catch (uploadError) {
          console.error("Image upload error:", uploadError);
          Toast.show({
            type: "error",
            text1: "Error",
            text2:
              Platform.OS === "web"
                ? "Failed to upload image. Web browsers may have limited file upload capabilities."
                : "Failed to upload image",
          });
          return;
        }
      }

      // Prepare data for saving
      const adData = {
        ...advertisement,
        image_url: imageUrl,
        created_by: member?.id || null,
      };

      if (advertisementId) {
        // Update existing advertisement
        const { error } = await supabase.from("advertisements").update(adData).eq("id", advertisementId);

        if (error) throw error;

        Toast.show({
          type: "success",
          text1: "Success",
          text2: "Advertisement updated successfully",
        });
      } else {
        // Create new advertisement
        const { error } = await supabase.from("advertisements").insert([adData]);

        if (error) throw error;

        Toast.show({
          type: "success",
          text1: "Success",
          text2: "Advertisement created successfully",
        });
      }

      onSave();
    } catch (error) {
      console.error("Error saving advertisement:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to save advertisement",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: "draft" | "active" | "inactive") => {
    setAdvertisement((prev) => ({ ...prev, status: newStatus }));
  };

  const toggleLocationSelection = (location: string) => {
    setAdvertisement((prev) => {
      const locations = [...prev.placement_locations];
      const index = locations.indexOf(location);

      if (index >= 0) {
        // Remove if already selected
        if (locations.length > 1) {
          // Ensure at least one location remains selected
          locations.splice(index, 1);
        }
      } else {
        // Add if not selected
        locations.push(location);
      }

      return { ...prev, placement_locations: locations };
    });
  };

  const toggleDeviceSelection = (device: string) => {
    setAdvertisement((prev) => {
      const devices = [...prev.target_devices];
      const index = devices.indexOf(device);

      if (index >= 0) {
        // Remove if already selected
        if (devices.length > 1) {
          // Ensure at least one device remains selected
          devices.splice(index, 1);
        }
      } else {
        // Add if not selected
        devices.push(device);
      }

      return { ...prev, target_devices: devices };
    });
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText>Loading advertisement...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.form}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">{advertisementId ? "Edit Advertisement" : "Create Advertisement"}</ThemedText>
          <AdvertisementStatusToggle status={advertisement.status} onStatusChange={handleStatusChange} />
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Title</ThemedText>
          <ThemedTextInput
            value={advertisement.title}
            onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, title: text }))}
            placeholder="Advertisement Title"
            style={styles.input}
          />
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <ThemedTextInput
            value={advertisement.description}
            onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, description: text }))}
            placeholder="Advertisement Description"
            multiline
            numberOfLines={4}
            style={styles.input}
            containerStyle={styles.textArea}
          />
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Destination URL</ThemedText>
          <ThemedTextInput
            value={advertisement.destination_url}
            onChangeText={(text) => setAdvertisement((prev) => ({ ...prev, destination_url: text }))}
            placeholder="https://example.com"
            style={styles.input}
          />
        </ThemedView>

        <ThemedView style={styles.row}>
          <ThemedView style={styles.formField}>
            <ThemedText style={styles.label}>Start Date</ThemedText>
            <DatePicker
              date={advertisement.start_date}
              onDateChange={(date) => date && setAdvertisement((prev) => ({ ...prev, start_date: date }))}
              placeholder="Select start date"
              style={styles.datePickerButton}
              textStyle={{ color: Colors[colorScheme].text, fontSize: 16 }}
              accessibilityLabel="Advertisement start date"
            />
          </ThemedView>

          <ThemedView style={styles.formField}>
            <ThemedText style={styles.label}>End Date</ThemedText>
            <DatePicker
              date={advertisement.end_date}
              onDateChange={(date) => date && setAdvertisement((prev) => ({ ...prev, end_date: date }))}
              placeholder="Select end date"
              minDate={advertisement.start_date}
              style={styles.datePickerButton}
              textStyle={{ color: Colors[colorScheme].text, fontSize: 16 }}
              accessibilityLabel="Advertisement end date"
            />
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Weight (Higher value = higher priority)</ThemedText>
          <ThemedTextInput
            value={advertisement.weight.toString()}
            onChangeText={(text) => {
              const weight = parseInt(text) || 1;
              setAdvertisement((prev) => ({ ...prev, weight }));
            }}
            keyboardType="numeric"
            style={styles.input}
          />
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Placement Locations</ThemedText>
          <ThemedView style={styles.optionsContainer}>
            <ThemedTouchableOpacity
              style={[
                styles.optionButton,
                advertisement.placement_locations.includes("home") && styles.optionButtonSelected,
              ]}
              onPress={() => toggleLocationSelection("home")}
            >
              <Ionicons
                name="home"
                size={20}
                color={advertisement.placement_locations.includes("home") ? "#000000" : Colors.dark.text}
              />
              <ThemedText style={advertisement.placement_locations.includes("home") ? styles.optionTextSelected : {}}>
                Home
              </ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[
                styles.optionButton,
                advertisement.placement_locations.includes("notifications_top") && styles.optionButtonSelected,
              ]}
              onPress={() => toggleLocationSelection("notifications_top")}
            >
              <Ionicons
                name="notifications"
                size={20}
                color={advertisement.placement_locations.includes("notifications_top") ? "#000000" : Colors.dark.text}
              />
              <ThemedText
                style={advertisement.placement_locations.includes("notifications_top") ? styles.optionTextSelected : {}}
              >
                Notifications Top
              </ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[
                styles.optionButton,
                advertisement.placement_locations.includes("notifications_sidebar") && styles.optionButtonSelected,
              ]}
              onPress={() => toggleLocationSelection("notifications_sidebar")}
            >
              <Ionicons
                name="desktop"
                size={20}
                color={
                  advertisement.placement_locations.includes("notifications_sidebar") ? "#000000" : Colors.dark.text
                }
              />
              <ThemedText
                style={
                  advertisement.placement_locations.includes("notifications_sidebar") ? styles.optionTextSelected : {}
                }
              >
                Notifications Sidebar
              </ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[
                styles.optionButton,
                advertisement.placement_locations.includes("notifications_bottom") && styles.optionButtonSelected,
              ]}
              onPress={() => toggleLocationSelection("notifications_bottom")}
            >
              <Ionicons
                name="arrow-down"
                size={20}
                color={
                  advertisement.placement_locations.includes("notifications_bottom") ? "#000000" : Colors.dark.text
                }
              />
              <ThemedText
                style={
                  advertisement.placement_locations.includes("notifications_bottom") ? styles.optionTextSelected : {}
                }
              >
                Notifications Bottom
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Target Devices</ThemedText>
          <ThemedView style={styles.optionsContainer}>
            <ThemedTouchableOpacity
              style={[
                styles.optionButton,
                advertisement.target_devices.includes("mobile") && styles.optionButtonSelected,
              ]}
              onPress={() => toggleDeviceSelection("mobile")}
            >
              <Ionicons
                name="phone-portrait"
                size={20}
                color={advertisement.target_devices.includes("mobile") ? "#000000" : Colors.dark.text}
              />
              <ThemedText style={advertisement.target_devices.includes("mobile") ? styles.optionTextSelected : {}}>
                Mobile
              </ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[styles.optionButton, advertisement.target_devices.includes("web") && styles.optionButtonSelected]}
              onPress={() => toggleDeviceSelection("web")}
            >
              <Ionicons
                name="desktop"
                size={20}
                color={advertisement.target_devices.includes("web") ? "#000000" : Colors.dark.text}
              />
              <ThemedText style={advertisement.target_devices.includes("web") ? styles.optionTextSelected : {}}>
                Web
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.formField}>
          <ThemedText style={styles.label}>Advertisement Image</ThemedText>
          <ThemedTouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={isUploadingImage}>
            {imageFile || advertisement.image_url ? (
              <ThemedView style={styles.imageContainer}>
                <Image
                  source={{ uri: imageFile || advertisement.image_url }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                <ThemedView style={styles.imageOverlay}>
                  {isUploadingImage ? (
                    <ActivityIndicator size="large" color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.imageHint}>Tap to change image</ThemedText>
                  )}
                </ThemedView>
              </ThemedView>
            ) : (
              <ThemedView style={styles.placeholderContainer}>
                {isUploadingImage ? (
                  <ActivityIndicator size="large" color={Colors[colorScheme].text} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={48} color={Colors[colorScheme].text} />
                    <ThemedText>Tap to select an image</ThemedText>
                  </>
                )}
              </ThemedView>
            )}
          </ThemedTouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.buttonContainer}>
          <Button onPress={handleSave} style={styles.saveButton} disabled={isSaving}>
            {isSaving ? "Saving..." : advertisementId ? "Update Advertisement" : "Create Advertisement"}
          </Button>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  form: {
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.dark.text,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 12,
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    minHeight: 40,
    width: "100%",
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    color: Colors.dark.buttonText,
  },
  optionButtonSelected: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
    color: Colors.dark.buttonText,
  },
  optionTextSelected: {
    color: "#000000",
  },
  imagePicker: {
    width: "100%",
    height: 200,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.dark.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageHint: {
    color: "#ffffff",
    fontWeight: "600",
  },
  placeholderContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  buttonContainer: {
    marginTop: 24,
  },
  saveButton: {
    marginBottom: 24,
  },
});

import React from "react";
import { Platform, TouchableOpacity } from "react-native";

// On web, we use the regular TouchableOpacity
// On mobile, we re-export the regular TouchableOpacity since we're not using gesture handler for basic touches
export { TouchableOpacity as TouchableOpacityComponent };

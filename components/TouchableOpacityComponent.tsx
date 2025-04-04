import React from "react";
import { Platform, TouchableOpacity, TouchableOpacityProps, View } from "react-native";

// Create a forwarded ref component that properly handles refs
const TouchableOpacityComponentBase = React.forwardRef<View, TouchableOpacityProps>((props, ref) => {
  return <TouchableOpacity ref={ref} {...props} />;
});

// Export the component with proper ref handling
export const TouchableOpacityComponent = TouchableOpacityComponentBase;

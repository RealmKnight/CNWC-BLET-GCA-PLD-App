import React from "react";
import { TouchableOpacity, TouchableOpacityProps, Platform, View } from "react-native";
import { Pressable, PressableProps } from "react-native";

type TouchableOpacityComponentProps = TouchableOpacityProps & PressableProps;

export const TouchableOpacityComponent = React.forwardRef<View, TouchableOpacityComponentProps>((props, ref) => {
  const { children, ...rest } = props;

  if (Platform.OS === "web") {
    return (
      <Pressable ref={ref} {...rest}>
        {children}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity ref={ref} {...rest}>
      {children}
    </TouchableOpacity>
  );
});

TouchableOpacityComponent.displayName = "TouchableOpacityComponent";

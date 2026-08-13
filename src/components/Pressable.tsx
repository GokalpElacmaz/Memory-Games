import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far the button shrinks while held. */
  scaleTo?: number;
  children?: React.ReactNode;
};

/** Pressable with a spring-less scale response — used for every tappable surface. */
export function PressableScale({ style, scaleTo = 0.96, children, ...rest }: Props) {
  const scale = useSharedValue(1);

  const onPressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      scale.value = withTiming(scaleTo, { duration: 90 });
      rest.onPressIn?.(event);
    },
    [rest, scale, scaleTo],
  );

  const onPressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (event) => {
      scale.value = withTiming(1, { duration: 130 });
      rest.onPressOut?.(event);
    },
    [rest, scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable {...rest} onPressIn={onPressIn} onPressOut={onPressOut} style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}

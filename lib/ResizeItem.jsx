// @flow
import React from "react";
import PropTypes from "prop-types";
import { DraggableCore } from "react-draggable";
import { Resizable } from "react-resizable";
import { fastPositionEqual, perc, setTopLeft, setTransform } from "./utils";
import {
  calcGridItemPosition,
  calcGridItemWHPx,
  calcGridColWidth,
  calcXY,
  calcWH,
  clamp
} from "./calculateUtils";
import {
  resizeHandleAxesType,
  resizeHandleType
} from "./ReactGridLayoutPropTypes";
import clsx from "clsx";
import type { Element as ReactElement, Node as ReactNode } from "react";

import type {
  ReactDraggableCallbackData,
  GridDragEvent,
  GridResizeEvent,
  DroppingPosition,
  Position
} from "./utils";

import type { PositionParams } from "./calculateUtils";
import type {
  ResizeHandleAxis,
  ResizeHandle,
  ReactRef
} from "./ReactGridLayoutPropTypes";

type PartialPosition = { top: number, left: number };
type GridItemCallback<Data: GridDragEvent | GridResizeEvent> = (
  i: string,
  w: number,
  h: number,
  Data
) => void;

type State = {
  resizing: ?{ width: number, height: number },
  dragging: ?{ top: number, left: number },
  className: string
};

type Props = {
  children: ReactElement<any>,
  cols: number,
  containerWidth: number,
  margin: [number, number],
  containerPadding: [number, number],
  rowHeight: number,
  maxRows: number,
  isDraggable: boolean,
  isResizable: boolean,
  isBounded: boolean,
  static?: boolean,
  useCSSTransforms?: boolean,
  usePercentages?: boolean,
  transformScale: number,
  droppingPosition?: DroppingPosition,

  className: string,
  style?: Object,
  // Draggability
  cancel: string,
  handle: string,

  x: number,
  y: number,
  w: number,
  h: number,

  minW: number,
  maxW: number,
  minH: number,
  maxH: number,
  i: string,

  resizeHandles?: ResizeHandleAxis[],
  resizeHandle?: ResizeHandle,

  onResize?: GridItemCallback<GridResizeEvent>,
  onResizeStart?: GridItemCallback<GridResizeEvent>,
  onResizeStop?: GridItemCallback<GridResizeEvent>
};

type DefaultProps = {
  className: string,
  cancel: string,
  handle: string,
  minH: number,
  minW: number,
  maxH: number,
  maxW: number,
  transformScale: number
};

/**
 * An individual item within a ReactGridLayout.
 */
export default class GridItem extends React.Component<Props, State> {
  static propTypes = {
    // Children must be only a single element
    children: PropTypes.element,

    // General grid attributes
    cols: PropTypes.number.isRequired,
    containerWidth: PropTypes.number.isRequired,
    rowHeight: PropTypes.number.isRequired,
    margin: PropTypes.array.isRequired,
    maxRows: PropTypes.number.isRequired,
    containerPadding: PropTypes.array.isRequired,

    // These are all in grid units
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
    w: PropTypes.number.isRequired,
    h: PropTypes.number.isRequired,

    // All optional
    minW: function (props: Props, propName: string) {
      const value = props[propName];
      if (typeof value !== "number") return new Error("minWidth not Number");
      if (value > props.w || value > props.maxW)
        return new Error("minWidth larger than item width/maxWidth");
    },

    maxW: function (props: Props, propName: string) {
      const value = props[propName];
      if (typeof value !== "number") return new Error("maxWidth not Number");
      if (value < props.w || value < props.minW)
        return new Error("maxWidth smaller than item width/minWidth");
    },

    minH: function (props: Props, propName: string) {
      const value = props[propName];
      if (typeof value !== "number") return new Error("minHeight not Number");
      if (value > props.h || value > props.maxH)
        return new Error("minHeight larger than item height/maxHeight");
    },

    maxH: function (props: Props, propName: string) {
      const value = props[propName];
      if (typeof value !== "number") return new Error("maxHeight not Number");
      if (value < props.h || value < props.minH)
        return new Error("maxHeight smaller than item height/minHeight");
    },

    // ID is nice to have for callbacks
    i: PropTypes.string.isRequired,

    // Resize handle options
    resizeHandles: resizeHandleAxesType,
    resizeHandle: resizeHandleType,

    // Functions
    onResizeStop: PropTypes.func,
    onResizeStart: PropTypes.func,
    onResize: PropTypes.func,

    // Flags
    isResizable: PropTypes.bool.isRequired,
    isBounded: PropTypes.bool.isRequired,
    static: PropTypes.bool,

    // Use CSS transforms instead of top/left
    useCSSTransforms: PropTypes.bool.isRequired,
    transformScale: PropTypes.number,

    // Others
    className: PropTypes.string,
    // Selector for draggable handle
    handle: PropTypes.string,
    // Selector for draggable cancel (see react-draggable)
    cancel: PropTypes.string,
    // Current position of a dropping element
    droppingPosition: PropTypes.shape({
      e: PropTypes.object.isRequired,
      left: PropTypes.number.isRequired,
      top: PropTypes.number.isRequired
    })
  };

  static defaultProps: DefaultProps = {
    className: "",
    cancel: "",
    handle: "",
    minH: 1,
    minW: 1,
    maxH: Infinity,
    maxW: Infinity,
    transformScale: 1
  };

  state: State = {
    resizing: null,
    dragging: null,
    className: ""
  };

  elementRef: ReactRef<HTMLDivElement> = React.createRef();

  shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
    // We can't deeply compare children. If the developer memoizes them, we can
    // use this optimization.
    if (this.props.children !== nextProps.children) return true;
    if (this.props.droppingPosition !== nextProps.droppingPosition) return true;
    // TODO memoize these calculations so they don't take so long?
    const oldPosition = calcGridItemPosition(
      this.getPositionParams(this.props),
      this.props.x,
      this.props.y,
      this.props.w,
      this.props.h,
      this.state
    );
    const newPosition = calcGridItemPosition(
      this.getPositionParams(nextProps),
      nextProps.x,
      nextProps.y,
      nextProps.w,
      nextProps.h,
      nextState
    );
    return (
      !fastPositionEqual(oldPosition, newPosition) ||
      this.props.useCSSTransforms !== nextProps.useCSSTransforms
    );
  }

  componentDidMount() {
  }

  componentDidUpdate(prevProps: Props) {
  }


  getPositionParams(props: Props = this.props): PositionParams {
    return {
      cols: props.cols,
      containerPadding: props.containerPadding,
      containerWidth: props.containerWidth,
      margin: props.margin,
      maxRows: props.maxRows,
      rowHeight: props.rowHeight
    };
  }

  /**
   * This is where we set the grid item's absolute placement. It gets a little tricky because we want to do it
   * well when server rendering, and the only way to do that properly is to use percentage width/left because
   * we don't know exactly what the browser viewport is.
   * Unfortunately, CSS Transforms, which are great for performance, break in this instance because a percentage
   * left is relative to the item itself, not its container! So we cannot use them on the server rendering pass.
   *
   * @param  {Object} pos Position object with width, height, left, top.
   * @return {Object}     Style object.
   */
  createStyle(pos: Position): { [key: string]: ?string } {
    const { usePercentages, containerWidth, useCSSTransforms } = this.props;

    let style;
    // CSS Transforms support (default)
    if (useCSSTransforms) {
      style = setTransform(pos);
    } else {
      // top,left (slow)
      style = setTopLeft(pos);

      // This is used for server rendering.
      if (usePercentages) {
        style.left = perc(pos.left / containerWidth);
        style.width = perc(pos.width / containerWidth);
      }
    }

    return style;
  }

  /**
   * Mix a Resizable instance into a child.
   * @param  {Element} child    Child element.
   * @param  {Object} position  Position object (pixel values)
   * @return {Element}          Child wrapped in Resizable.
   */
  mixinResizable(
    child: ReactElement<any>,
    position: Position,
    isResizable: boolean
  ): ReactElement<any> {
    const {
      cols,
      x,
      minW,
      minH,
      maxW,
      maxH,
      transformScale,
      resizeHandles,
      resizeHandle
    } = this.props;
    const positionParams = this.getPositionParams();

    // This is the max possible width - doesn't go to infinity because of the width of the window
    const maxWidth = calcGridItemPosition(positionParams, 0, 0, cols - x, 0)
      .width;

    // Calculate min/max constraints using our min & maxes
    const mins = calcGridItemPosition(positionParams, 0, 0, minW, minH);
    const maxes = calcGridItemPosition(positionParams, 0, 0, maxW, maxH);
    const minConstraints = [mins.width, mins.height];
    const maxConstraints = [
      Math.min(maxes.width, maxWidth),
      Math.min(maxes.height, Infinity)
    ];
    return (
      <Resizable
        className={isResizable ? undefined : "react-resizable-hide"}
        width={position.width}
        height={position.height}
        // minConstraints={minConstraints}
        // maxConstraints={maxConstraints}
        onResizeStop={this.onResizeStop}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        transformScale={transformScale}
        resizeHandles={resizeHandles}
        handle={resizeHandle}
      >
        {child}
      </Resizable>
    );
  }

  /**
   * onResizeStop event handler
   * @param  {Event}  e             event data
   * @param  {Object} callbackData  an object with node and size information
   */
  onResizeStop: (Event, { node: HTMLElement, size: Position }) => void = (
    e,
    callbackData
  ) => {
    this.onResizeHandler(e, callbackData, "onResizeStop");
  };

  /**
   * onResizeStart event handler
   * @param  {Event}  e             event data
   * @param  {Object} callbackData  an object with node and size information
   */
  onResizeStart: (Event, { node: HTMLElement, size: Position }) => void = (
    e,
    callbackData
  ) => {
    this.onResizeHandler(e, callbackData, "onResizeStart");
  };

  /**
   * onResize event handler
   * @param  {Event}  e             event data
   * @param  {Object} callbackData  an object with node and size information
   */
  onResize: (Event, { node: HTMLElement, size: Position }) => void = (
    e,
    callbackData
  ) => {
    this.onResizeHandler(e, callbackData, "onResize");
  };

  /**
   * Wrapper around drag events to provide more useful data.
   * All drag events call the function with the given handler name,
   * with the signature (index, x, y).
   *
   * @param  {String} handlerName Handler name to wrap.
   * @return {Function}           Handler function.
   */
  onResizeHandler(
    e: Event,
    { node, size, handle }: { node: HTMLElement, size: Position },
    handlerName: string
  ): void {
    e.stopPropagation();
    e.preventDefault();
    const handler = this.props[handlerName];
    if (!handler) return;
    const { cols, x, y, i, maxH, minH } = this.props;
    let { minW, maxW } = this.props;
    let { w, h } = calcWH(
      this.getPositionParams(),
      size.width,
      size.height,
      x,
      y
    );
    // minW should be at least 1 (TODO propTypes validation?)
    minW = Math.max(minW, 1);

    // maxW should be at most (cols - x)
    maxW = Math.min(maxW, cols - x);

    // Min/max capping
    // w = clamp(w, minW, maxW);
    // h = clamp(h, minH, maxH);

    this.setState({ resizing: handlerName === "onResizeStop" ? null : size });

    handler.call(this, i, w, h, { e, node, size });
  }

  render(): ReactNode {
    const {
      x,
      y,
      w,
      h,
      isDraggable,
      isResizable,
      droppingPosition,
      useCSSTransforms
    } = this.props;

    const pos = calcGridItemPosition(
      this.getPositionParams(),
      x,
      y,
      w,
      h,
      this.state
    );
    const child = React.Children.only(this.props.children);

    // Create the child element. We clone the existing element but modify its className and style.
    let newChild = React.cloneElement(child, {
      ref: this.elementRef,
      className: clsx(
        "react-grid-item grid-item-active",
        child.props.className,
        this.props.className,
        {
          static: this.props.static,
          resizing: Boolean(this.state.resizing),
          // "react-draggable": isDraggable,
          // "react-draggable-dragging": Boolean(this.state.dragging),
          // dropping: Boolean(droppingPosition),
          cssTransforms: useCSSTransforms
        }
      ),
      // We can set the width and height on the child, but unfortunately we can't set the position.
      style: {
        ...this.props.style,
        ...child.props.style,
        ...this.createStyle(pos),
      }
    });

    // Resizable support. This is usually on but the user can toggle it off.
    newChild = this.mixinResizable(newChild, pos, isResizable);

    // Draggable support. This is always on, except for with placeholders.
    // newChild = this.mixinDraggable(newChild, isDraggable);

    return newChild;
  }
}
